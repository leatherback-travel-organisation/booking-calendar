type AppMarkProps = {
  name: "trtl" | "answers" | "supplier";
};

export function AppMark({ name }: AppMarkProps) {
  if (name === "trtl") {
    return (
      <svg viewBox="0 0 64 64" fill="none">
        <path d="M10 42.5c8.3-2.1 14.8-7.8 19.2-17.1l3.1-6.5 4 5.6c4 5.7 9.9 9.3 17.7 10.9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M14 48.5c10-2 18-7 24-15 3.9 3.9 7.9 6.6 12 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".52" />
        <circle cx="32" cy="18.5" r="3" fill="currentColor" />
      </svg>
    );
  }

  if (name === "answers") {
    return (
      <svg viewBox="0 0 64 64" fill="none">
        <path d="M13 44.5c9.1-14.7 18.2-24.2 27.2-28.5-1 11 2.6 20.7 10.8 29" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M19 41.5c7.7-1.8 15.7-1.8 24 0M24.5 32c5-1.1 10.2-1 15.5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
        <path d="m43.5 12 1.3 3.7 3.7 1.3-3.7 1.3-1.3 3.7-1.3-3.7-3.7-1.3 3.7-1.3 1.3-3.7Z" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path d="M13 43c6.7-2.3 12.6-6.6 17.6-13 5 4.4 11.8 7.2 20.4 8.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M15 49c7.3-1 13.8-3.9 19.5-8.7 4.1 2.6 8.9 4.1 14.5 4.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
      <path d="M31 14v19M25 20l6-6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
