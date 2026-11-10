import { dark } from "@clerk/ui/themes";

export const clerkAppearance = {
  theme: dark,
  variables: {
    colorPrimary: "#E0A84A",
    colorBackground: "#151B29",
    colorInputBackground: "#111827",
    colorInputText: "#F8FAFC",
    colorText: "#F8FAFC",
    colorTextSecondary: "#94A3B8",
    colorNeutral: "#F8FAFC",
    borderRadius: "0.75rem",
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  },
  options: {
    socialButtonsVariant: "blockButton" as const,
    socialButtonsPlacement: "top" as const,
  },
};

export const clerkLocalization = {
  signIn: {
    start: {
      title: "Sign in to DawnClips",
      subtitle: "Welcome back! Sign in to continue",
      actionText: "Don't have an account?",
      actionLink: "Sign up",
    },
  },
  signUp: {
    start: {
      title: "Create your DawnClips account",
      subtitle: "Your MLBB moments. Your community.",
      actionText: "Already have an account?",
      actionLink: "Sign in",
    },
  },
  formFieldLabel__emailAddress: "Email address",
  formFieldInputPlaceholder__emailAddress: "Enter your email address",
  dividerText: "or",
  socialButtonsBlockButton: "Continue with {{provider|titleize}}",
};
