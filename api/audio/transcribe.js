import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs';

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Body parser 비활성화 (multipart/form-data 처리를 위해 필요)
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // CORS 설정 (React Native 앱에서 호출 가능하도록)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight request 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST 메서드만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
    });
  }

  try {
    // OpenAI API 키 확인
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY 환경변수가 설정되지 않았습니다');
      return res.status(500).json({
        success: false,
        error: '서버 설정 오류',
      });
    }

    console.log('Starting audio transcription...');

    // formidable로 파일 파싱
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB (Vercel 제한 고려)
      keepExtensions: true,
      allowEmptyFiles: false,
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('Form parsing error:', err);
          reject(err);
        } else {
          resolve([fields, files]);
        }
      });
    });

    // 파일 검증
    const audioFile = files.file?.[0] || files.file;
    if (!audioFile) {
      return res.status(400).json({
        success: false,
        error: 'file 필드가 필요합니다 (오디오 파일)',
        example: {
          description: 'multipart/form-data로 file 필드에 오디오 파일 전송',
          supportedFormats: 'mp4, mp3, wav, m4a, webm (최대 10MB)',
        },
      });
    }

    // 파일 정보 로깅
    console.log('Audio file received:', {
      filename: audioFile.originalFilename || audioFile.newFilename,
      size: `${(audioFile.size / 1024).toFixed(2)} KB`,
      type: audioFile.mimetype,
      path: audioFile.filepath,
    });

    // 파일 크기 검증
    if (audioFile.size === 0) {
      return res.status(400).json({
        success: false,
        error: '빈 파일입니다. 유효한 오디오 파일을 업로드해주세요.',
      });
    }

    // OpenAI Whisper API 호출
    // 앱의 VoiceRecordingModal.tsx:276-282와 동일한 파라미터 사용
    console.log('Calling OpenAI Whisper API...');
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile.filepath),
      model: 'gpt-4o-transcribe', // 앱과 동일
      language: 'ko', // 앱과 동일 - 한국어 지정
      response_format: 'json', // 앱과 동일
      prompt: '일기, 하루, 오늘, 어제, 내일, 기분, 감정, 생각, 경험, 일상', // 앱과 동일
    });

    // 임시 파일 삭제
    try {
      fs.unlinkSync(audioFile.filepath);
      console.log('Temporary file deleted');
    } catch (cleanupError) {
      console.warn('Failed to delete temporary file:', cleanupError);
      // 파일 삭제 실패는 치명적이지 않으므로 계속 진행
    }

    console.log('Transcription completed:', {
      textLength: transcription.text?.length || 0,
      language: transcription.language,
      duration: transcription.duration,
    });

    // 성공 응답 (앱의 응답 형식과 호환)
    return res.status(200).json({
      success: true,
      text: transcription.text,
      language: transcription.language || 'ko',
      duration: transcription.duration,
    });

  } catch (error) {
    console.error('Transcribe audio error:', error);

    // 임시 파일 정리 시도 (에러 발생 시에도)
    try {
      if (error.filepath) {
        fs.unlinkSync(error.filepath);
      }
    } catch (cleanupError) {
      // 무시
    }

    // OpenAI API 에러 처리
    if (error.code === 'insufficient_quota') {
      return res.status(402).json({
        success: false,
        error: 'OpenAI API 할당량 초과',
      });
    }

    if (error.code === 'invalid_api_key') {
      return res.status(401).json({
        success: false,
        error: 'OpenAI API 키가 유효하지 않습니다',
      });
    }

    // formidable 파일 크기 초과 에러
    if (error.code === 'LIMIT_FILE_SIZE' || error.httpCode === 413) {
      return res.status(413).json({
        success: false,
        error: '파일 크기가 너무 큽니다 (최대 10MB)',
      });
    }

    // formidable 파싱 에러
    if (error.httpCode === 400) {
      return res.status(400).json({
        success: false,
        error: '파일 업로드 처리 중 오류가 발생했습니다',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }

    // 일반 에러
    return res.status(500).json({
      success: false,
      error: '음성 전사 중 오류가 발생했습니다',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
