import { dt } from "@/features/core/i18n/lib";

export const organizationsEn = {
  personal: "Personal",
  roles: { owner: "Owner", admin: "Admin", member: "Member" },
  errors: {
    notMember: "You are not a member of that organization.",
    seatsFull:
      "All seats in this organization are taken. Add a seat or remove a member first.",
    personal: "A personal organization has exactly one member: its owner.",
    lastOwner: "An organization needs at least one owner.",
    alreadyMember: "That person is already a member.",
  },
  switcher: {
    label: "Organization",
    create: "New organization",
    personalHint: "Personal",
  },
  settings: {
    title: "Organization",
    lead: "Members, invitations and the organization's name.",
    name: "Name",
    rename: "Rename",
    renamed: "Organization renamed.",
    members: "Members",
    seats: dt("{used:number} of {limit:number} seats", {}),
    seatsUnlimited: "Unlimited seats",
    you: "You",
    joined: "Joined {when:date}",
    role: "Role",
    remove: "Remove",
    removeConfirm:
      "Remove {name} from the organization? They keep their own personal organization.",
    removed: "Member removed.",
    roleUpdated: "Role updated.",
    leave: "Leave organization",
    leaveConfirm: "Leave {name}? You will need a new invitation to come back.",
    left: "You left the organization.",
    invites: "Pending invitations",
    noInvites: "No pending invitations.",
    invite: "Invite someone",
    inviteEmail: "Email",
    inviteRole: "Role",
    inviteSubmit: "Send invitation",
    invited: "Invitation sent to {email}.",
    inviteLinkTitle: "Invitation link",
    inviteLinkLead:
      "The link was emailed. You can also copy it and hand it over yourself — it only works for {email}.",
    copyLink: "Copy link",
    copied: "Copied.",
    expires: "Expires {when:date}",
    revoke: "Revoke",
    revoked: "Invitation revoked.",
    createTitle: "New organization",
    createLead:
      "A team organization has its own plan, members and seats. You will be its owner.",
    createName: "Organization name",
    createSubmit: "Create",
    created: "Organization created.",
    addSeat: "Add a seat",
  },
  invite: {
    title: "You're invited",
    lead: "{inviter} invited you to join {organization} as {role}.",
    accept: "Join {organization}",
    accepted: "Welcome to {organization}.",
    signInFirst: "Sign in with the invited email address to accept.",
    signIn: "Sign in",
    signUp: "Create an account",
    invalid: "This invitation is no longer valid. Ask for a new one.",
    wrongAccount:
      "This invitation was sent to a different email address. Sign in with that address to accept it.",
    switchAccount: "Sign in with another account",
  },
  emails: {
    invite: {
      subject: "You've been invited to {organization} on Gateling Meetings",
      intro:
        "{inviter} invited you to join {organization} on Gateling Meetings. Accept to host meetings under the organization's plan.",
      cta: "Accept invitation",
      notice:
        "The link works for a week and only for the address it was sent to.",
      text: "{inviter} invited you to join {organization} on Gateling Meetings. Accept here: {url}",
    },
  },
} as const;
