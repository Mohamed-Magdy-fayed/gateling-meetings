import { adminEn } from "@/features/admin/translations/admin-en";
import { billingEn } from "@/features/billing/translations/billing-en";
import { integrationsEn } from "@/features/integrations/translations/integrations-en";
import { legalEn } from "@/features/legal/translations/legal-en";
import { meetingsEn } from "@/features/meetings/translations/meetings-en";
import { organizationsEn } from "@/features/organizations/translations/organizations-en";
import type { LanguageMessages } from "../lib";

export default {
  locale: "en",
  opposite: "عربي",
  appName: "Gateling Meetings",
  logoName: "Gateling",
  brand: {
    product: "Meetings",
    company: "Gateling Solutions",
    builtBy: "Built by",
    byCompany: "by Gateling Solutions",
    visitSite: "Visit gateling.com",
  },
  settings: {
    title: "Settings",
    lead: "Your account, your organization, its plan and the systems connected to it.",
    account: {
      title: "Account",
      lead: "Who you are signed in as, and how you sign in.",
      verified: "Email verified",
      unverified: "Email not verified",
    },
    tabs: {
      account: "Account",
      organization: "Organization",
      billing: "Billing",
      integrations: "Integrations",
    },
  },
  nav: {
    label: "Main navigation",
    home: "Home",
    schedule: "Schedule",
    newMeeting: "New meeting",
    join: "Join",
    more: "More",
    joinSheet: {
      title: "Join a meeting",
      lead: "Paste the code or link you were sent.",
    },
  },
  actions: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    create: "Create",
    search: "Search",
  },
  common: {
    loading: "Loading...",
    empty: "No data available.",
    required: "Required",
    yes: "Yes",
    no: "No",
    confirm: "Confirm",
    areYouSure: "Are you sure?",
    back: "Back",
    next: "Next",
    close: "Close",
    noOptionsFound: "No options found.",
    actions: "Actions",
    createdAt: "Created At",
    createdBy: "Created By",
    updatedAt: "Last Updated At",
    updatedBy: "Last Updated By",
    deletedAt: "Deleted At",
    deletedBy: "Deleted By",
  },
  errors: {
    generic: "Something went wrong. Please try again.",
    notFound: "The requested item was not found.",
    unauthorized: "You are not authorized to perform this action.",
    validationFailed: "Please check the highlighted fields and try again.",
  },
  forms: {
    validation: {
      required: "This field is required.",
      max32: "Must be at most 32 characters.",
      max128: "Must be at most 128 characters.",
      max200: "Must be at most 200 characters.",
      max256: "Must be at most 256 characters.",
      max500: "Must be at most 500 characters.",
      max1024: "Must be at most 1024 characters.",
      max2000: "Must be at most 2000 characters.",
      max4000: "Must be at most 4000 characters.",
      url: "Must be a web address starting with http:// or https://.",
    },
    imageUpload: {
      success: "Image uploaded.",
      error: "Could not upload image.",
      unsupportedType: "Choose a JPEG, PNG, WebP, GIF, or AVIF image.",
      uploading: "Uploading…",
    },
  },
  languageToggle: "Switch language",
  themeToggle: "Toggle theme",
  auth: {
    emails: {
      common: {
        fromName: "Gateling Meetings",
        defaultRecipientName: "there",
        greeting: "Hi {name},",
        signature: "— The Gateling Meetings Team",
        minuteSingular: "minute",
        minutePlural: "minutes",
      },
      emailVerification: {
        subject: "Verify your email address",
        text: "Hi {name}, please verify your email within {expiryHours} hours: {verificationUrl}",
        intro:
          "Please confirm your email address. This link expires in {expiryHours} hours.",
        ctaLabel: "Verify email",
        ignore: "If you didn't create this account, you can ignore this email.",
      },
      passwordReset: {
        subject: "Your password reset code",
        text: "Hi {name}, your password reset code is {code}. It expires in {expiresIn} {minutesLabel}.",
        intro:
          "Use the code below to reset your password. It expires in {expiresIn} {minutesLabel}.",
        ignore:
          "If you didn't request a password reset, you can ignore this email.",
      },
    },
    backToHome: "Back to home",
    signOut: "Sign out",
    emailPlaceholder: "you@example.com",
    error: {
      badRequest: "Invalid request. Please try again.",
      credentials: "Incorrect email or password.",
      rateLimited: "Too many attempts. Please try again later.",
    },
    validation: {
      required: "This field is required.",
      invalidEmail: "Enter a valid email address.",
      invalidPhone: "Enter a valid phone number.",
      passwordRequired: "Password is required.",
      passwordMinLength: "Password must be at least 8 characters.",
      passwordLowercase: "Password must include a lowercase letter.",
      passwordUppercase: "Password must include an uppercase letter.",
      passwordNumber: "Password must include a number.",
      otpSixDigits: "Enter the 6-digit code.",
    },
    signIn: {
      title: "Welcome back",
      description: "Sign in to your Gateling Meetings account.",
      continueWith: "Or continue with email",
      emailLabel: "Email",
      continue: "Continue",
      passwordLabel: "Password",
      forgotPassword: "Forgot password?",
      back: "Back",
      submitting: "Signing in…",
      submit: "Sign in",
      noAccount: "Don't have an account?",
      toSignUp: "Sign up",
      hasAccount: "Already have an account?",
    },
    signUp: {
      title: "Create your account",
      description: "Host your own meetings — free to start.",
      nameLabel: "Full name",
      emailLabel: "Email",
      phoneLabel: "Phone number",
      passwordLabel: "Password",
      submitting: "Creating account…",
      submit: "Create account",
      toSignIn: "Sign in",
      error: {
        duplicate: "An account with this email already exists.",
        generic: "Could not create your account. Please try again.",
        sessionFailed:
          "Your account was created, but we couldn't sign you in automatically. Please sign in.",
      },
    },
    oauth: {
      error: {
        failed: "Failed to connect. Please try again.",
      },
    },
    passwordReset: {
      submitting: "Sending code…",
      submit: "Send reset code",
      otpLabel: "6-digit code",
      newPasswordLabel: "New password",
      request: {
        emailError: "Could not send the reset code. Please try again.",
      },
      reset: {
        submit: "Reset password",
        success: "Your password has been reset.",
        invalidCode: "That code is invalid or expired.",
        error: "Could not reset your password. Please try again.",
      },
    },
    emailVerification: {
      heading: "Verify your email",
      backHome: "Back to home",
      alreadyVerifiedNote: "Your email is already verified.",
      sent: "Verification email sent.",
      success: { verified: "Your email has been verified." },
      passkeyPrompt: {
        setUp: "Set up a passkey",
        skip: "Skip, go to dashboard",
      },
      notice: {
        missingEmail: "No email on file to verify.",
        signInRequired: "Sign in to verify your email.",
        sending: "Sending…",
        sendButton: "Resend verification email",
      },
      error: {
        missingEmail: "No email on file to verify.",
        sendFailed: "Could not send the verification email.",
        invalidToken: "This verification link is invalid.",
        expired: "This verification link has expired.",
      },
    },
    passkeys: {
      pageTitle: "Passkeys",
      pageDescription:
        "Manage the passkeys you can use to sign in without a password.",
      add: "Add a passkey",
      registering: "Registering…",
      deleting: "Removing…",
      delete: {
        label: "Remove",
        confirm:
          "Remove this passkey? You may not be able to sign in with it again.",
        notFound: "Passkey not found.",
        success: "Passkey removed.",
        error: "Could not remove passkey.",
      },
      list: {
        empty: "No passkeys yet.",
        emptyLead:
          "Add one to sign in with your fingerprint, face or device PIN instead of a password.",
        defaultLabel: "Passkey",
        created: "Added",
        lastUsed: "Last used",
      },
      register: {
        unsupported: "Passkeys aren't supported on this device.",
        success: "Passkey registered.",
        cancelled: "Passkey registration was cancelled.",
        error: "Could not register passkey.",
        invalidChallenge:
          "This registration attempt expired. Please try again.",
      },
      auth: {
        button: "Sign in with a passkey",
        pending: "Signing in…",
        error: {
          emailRequired: "Enter your email first.",
          unsupported: "Passkeys aren't supported on this device.",
          cancelled: "Passkey sign-in was cancelled.",
          generic: "Could not sign in with that passkey.",
          userNotFound: "No account found for that email.",
          noPasskey:
            "No passkey is set up for that email. Sign in with your password first, then add one from Passkeys.",
          noCredentials: "This account has no passkeys yet.",
          invalidChallenge: "This sign-in attempt expired. Please try again.",
          credentialMismatch: "That passkey isn't registered to this account.",
        },
      },
      error: {
        missingRpId: "Passkeys aren't available in this environment.",
      },
    },
  },
  meetings: meetingsEn,
  integrations: integrationsEn,
  billing: billingEn,
  organizations: organizationsEn,
  admin: adminEn,
  legal: legalEn,
} as const satisfies LanguageMessages;
