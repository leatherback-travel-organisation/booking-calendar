import type { Metadata } from "next";
import { IdentityProvider } from "@/components/identity-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cove · Leatherback Travel",
  description: "Your Leatherback applications, together in one secure place."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><IdentityProvider>{children}</IdentityProvider></body>
    </html>
  );
}
