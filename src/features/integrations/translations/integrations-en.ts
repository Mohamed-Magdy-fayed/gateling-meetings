export const integrationsEn = {
  sso: {
    title: "This link didn't work",
    reasons: {
      expired: "The link has expired. Go back and open the meeting again.",
      used: "This link was already used. Go back and open the meeting again to get a fresh one.",
      invalid:
        "The link is not valid. Go back to where you came from and try again.",
    },
    backHome: "Back to home",
  },
  room: {
    backTo: "Back to {name}",
  },
  admin: {
    title: "Integrations",
    lead: "Other systems that create meetings and send their users here through the API.",
    empty: "No integrations yet.",
    create: "New integration",
    name: "Name",
    namePlaceholder: "Atelier",
    slug: "Slug",
    slugHint:
      "Lowercase letters, digits and dashes. Used as the token audience; cannot be changed later.",
    webhookUrl: "Webhook URL (optional)",
    webhookUrlHint:
      "Where meeting events are POSTed. HTTPS required in production.",
    allowedReturnOrigins: "Allowed return origins",
    allowedReturnOriginsHint:
      "One origin per line, e.g. https://atelier.example. A returnUrl must be on one of these.",
    submit: "Create",
    created: "Integration created.",
    keyTitle: "Copy the API key now",
    keyLead:
      "It is shown only once. Store it in the other system's environment; if you lose it, rotate the key.",
    apiKey: "API key",
    webhookSecret: "Webhook secret",
    copy: "Copy",
    copied: "Copied.",
    done: "Done",
    rotateKey: "Rotate key",
    rotateConfirm:
      "Rotate the API key? The current key stops working immediately.",
    rotated: "Key rotated.",
    revoke: "Revoke",
    revokeConfirm:
      "Revoke this integration? Its API key and every join link it minted stop working.",
    revoked: "Integration revoked.",
    status: { active: "Active", revoked: "Revoked" },
    keyPrefix: "Key",
    lastUsed: "Last used {when:date}",
    neverUsed: "Never used",
    noWebhook: "No webhook",
    deliveries: "Recent webhook deliveries",
    noDeliveries: "No deliveries yet.",
    delivery: {
      event: "Event",
      status: "Status",
      attempts: "Attempts",
      when: "When",
      statuses: {
        pending: "Pending",
        delivered: "Delivered",
        failed: "Failed",
      },
    },
    validation: {
      slug: "Use 2–64 lowercase letters, digits or dashes.",
      slugTaken: "That slug is already in use.",
      origin: "Each line must be an origin like https://example.com.",
      webhookHttps: "The webhook URL must use https://.",
    },
  },
} as const;
