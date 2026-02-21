"use client";

import { historyApi } from "./api";

export type RTCEventHandler = {
  onStatusChange: (status: "connecting" | "listening" | "speaking" | "processing" | "ended") => void;
  onUserTranscript: (text: string) => void;
  onAssistantTranscript: (text: string, isDone: boolean) => void;
  onError: (error: string) => void;
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown>;
};

class RealtimeWebRTCClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private handlers: RTCEventHandler | null = null;
  private accessToken: string | null = null;

  // 현재 assistant 누적 텍스트 (delta 방식)
  private assistantBuffer = "";
  private currentItemId = "";

  async connect(
    ephemeralToken: string,
    model: string,
    handlers: RTCEventHandler,
    accessToken: string
  ) {
    this.handlers = handlers;
    this.accessToken = accessToken;
    handlers.onStatusChange("connecting");

    try {
      // ── PeerConnection 생성 ──
      this.pc = new RTCPeerConnection();

      // ── 원격 오디오 출력 ──
      this.audioEl = document.createElement("audio");
      this.audioEl.autoplay = true;
      this.pc.ontrack = (e) => {
        if (this.audioEl) this.audioEl.srcObject = e.streams[0];
      };

      // ── 마이크 입력 ──
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => this.pc!.addTrack(t, stream));

      // ── DataChannel ──
      this.dc = this.pc.createDataChannel("oai-events");
      this.dc.onopen = () => {
        handlers.onStatusChange("listening");
      };
      this.dc.onmessage = (e) => this.handleEvent(JSON.parse(e.data));

      // ── SDP Offer ──
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=${model}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ephemeralToken}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        }
      );

      if (!sdpResponse.ok) {
        throw new Error(`SDP 교환 실패: ${sdpResponse.status}`);
      }

      const answer: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await this.pc.setRemoteDescription(answer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "WebRTC 연결 실패";
      handlers.onError(msg);
      handlers.onStatusChange("ended");
    }
  }

  private async handleEvent(event: Record<string, unknown>) {
    const type = event.type as string;

    switch (type) {
      // ── 음성 감지 시작 → listening ──
      case "input_audio_buffer.speech_started":
        this.handlers?.onStatusChange("listening");
        break;

      // ── 사용자 발화 완성 transcript ──
      case "conversation.item.input_audio_transcription.completed":
        this.handlers?.onUserTranscript((event.transcript as string) || "");
        break;

      // ── AI 응답 생성 시작 → processing ──
      case "response.created":
        this.handlers?.onStatusChange("processing");
        this.assistantBuffer = "";
        break;

      // ── AI 텍스트 delta ──
      case "response.text.delta": {
        const delta = (event as { delta?: string }).delta || "";
        this.assistantBuffer += delta;
        this.handlers?.onAssistantTranscript(this.assistantBuffer, false);
        break;
      }

      // ── AI 오디오 출력 시작 → speaking ──
      case "response.audio.started":
        this.handlers?.onStatusChange("speaking");
        break;

      // ── AI 응답 텍스트 완성 ──
      case "response.text.done":
        this.handlers?.onAssistantTranscript(
          (event as { text?: string }).text || this.assistantBuffer,
          true
        );
        this.assistantBuffer = "";
        break;

      // ── AI 응답 완전 완료 → listening ──
      case "response.done":
        this.handlers?.onStatusChange("listening");
        break;

      // ── Tool Call (get_conversation_history) ──
      case "response.function_call_arguments.done": {
        const name = (event as { name?: string }).name || "";
        const callId = (event as { call_id?: string }).call_id || "";
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse((event as { arguments?: string }).arguments || "{}");
        } catch { /* 무시 */ }

        if (name === "get_conversation_history") {
          await this.handleHistoryToolCall(callId, args);
        } else if (name === "web_search") {
          await this.handleWebSearchToolCall(callId, args);
        }
        break;
      }

      case "error": {
        const errMsg = (event as { error?: { message?: string } }).error?.message || "알 수 없는 오류";
        this.handlers?.onError(errMsg);
        break;
      }
    }
  }

  private async handleHistoryToolCall(
    callId: string,
    args: Record<string, unknown>
  ) {
    try {
      const response = await historyApi.getHistory({
        date: args.date as string | undefined,
        keyword: args.keyword as string | undefined,
        limit: Math.min((args.limit as number) || 5, 10),
      });

      const sessions = response.data.sessions || [];
      const resultText =
        sessions.length === 0
          ? "해당 날짜/키워드의 이전 대화 기록이 없습니다."
          : sessions
              .slice(0, 5)
              .map(
                (s: {
                  started_at: string;
                  one_liner?: string;
                  keywords?: string[];
                  emotions?: string[];
                  context_summary?: string;
                }) => {
                  const date = new Date(s.started_at).toLocaleDateString("ko-KR", {
                    year: "numeric", month: "long", day: "numeric", weekday: "short",
                  });
                  const keywords = (s.keywords || []).join(", ") || "없음";
                  const emotions = (s.emotions || []).join(", ") || "없음";
                  const context = s.context_summary
                    ? `\n  맥락: ${s.context_summary.slice(0, 100)}`
                    : "";
                  return `[${date}]\n  요약: ${s.one_liner || "기록 없음"}\n  키워드: ${keywords}\n  감정: ${emotions}${context}`;
                }
              )
              .join("\n\n");

      // tool result를 DataChannel로 전송
      this.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: resultText,
        },
      });

      // 응답 생성 요청
      this.sendEvent({ type: "response.create" });
    } catch (err) {
      console.error("History tool call failed:", err);
      this.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: "이전 대화 기록을 불러오는 데 실패했습니다.",
        },
      });
      this.sendEvent({ type: "response.create" });
    }
  }

  private async handleWebSearchToolCall(
    callId: string,
    args: Record<string, unknown>
  ) {
    const query = (args.query as string) || "";
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({ query, max_results: 5 }),
      });

      if (!response.ok) throw new Error(`search failed: ${response.status}`);
      const data = await response.json();

      // AI에 주입할 컴팩트 포맷
      let resultText = "";
      if (data.answer) {
        resultText += `요약 답변: ${data.answer}\n\n`;
      }
      if (data.results?.length > 0) {
        resultText += "검색 결과:\n" + data.results
          .slice(0, 3)
          .map((r: { title: string; content: string; url: string }) =>
            `- ${r.title}\n  ${r.content}\n  출처: ${r.url}`
          )
          .join("\n\n");
      }
      if (!resultText) resultText = "검색 결과를 찾을 수 없습니다.";

      this.sendEvent({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output: resultText },
      });
      this.sendEvent({ type: "response.create" });
    } catch (err) {
      console.error("Web search tool call failed:", err);
      this.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: "웹 검색 중 오류가 발생했습니다.",
        },
      });
      this.sendEvent({ type: "response.create" });
    }
  }

  sendEvent(event: Record<string, unknown>) {
    if (this.dc?.readyState === "open") {
      this.dc.send(JSON.stringify(event));
    }
  }

  disconnect() {
    this.dc?.close();
    this.pc?.close();
    if (this.audioEl) {
      this.audioEl.srcObject = null;
    }
    this.pc = null;
    this.dc = null;
    this.handlers?.onStatusChange("ended");
  }

  isConnected() {
    return this.dc?.readyState === "open";
  }
}

// 싱글턴
export const realtimeClient = new RealtimeWebRTCClient();
