import type { ReactNode } from "react";
import { CoveClerkProvider } from "@leatherback/cove-auth/provider";

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body><CoveClerkProvider>{children}</CoveClerkProvider></body>
    </html>
  );
}
