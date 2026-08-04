import { ClerkProvider } from "@clerk/nextjs";
import { identityMode } from "@/lib/identity/server";
import { getAllowedSatelliteOrigins } from "@/lib/identity/satellite-domains";

export async function IdentityProvider({ children }: { children: React.ReactNode }) {
  if (identityMode() !== "clerk") return children;
  const allowedRedirectOrigins = await getAllowedSatelliteOrigins();

  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      signInUrl="/sign-in"
      signUpUrl="/sign-in"
      allowedRedirectOrigins={[...allowedRedirectOrigins]}
      afterSignOutUrl="/sign-in"
      localization={{
        signIn: {
          start: {
            title: "Sign in to Cove",
            subtitle: "Sign in with Google using your approved work email.",
          },
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
