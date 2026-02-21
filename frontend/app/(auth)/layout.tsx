export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative" }}>
      {children}
    </div>
  );
}
