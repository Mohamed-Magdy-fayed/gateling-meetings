"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { CopyIcon, UserPlusIcon, XCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useAppForm } from "@/components/forms/hooks";
import {
  OverlayFormBody,
  OverlayFormFooterActions,
  OverlayFormSubmitButton,
} from "@/components/forms/overlay-form";
import { LinkButton } from "@/components/general/link-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type OrganizationRole,
  organizationRoleValues,
} from "@/drizzle/schema";
import { useTranslation } from "@/features/core/i18n/client";
import { translationKey } from "@/features/core/i18n/global";
import { useTRPC } from "@/integrations/trpc/client";

type OrganizationSettingsProps = {
  canEdit: boolean;
  isOwner: boolean;
  isPersonal: boolean;
  organizationName: string;
};

export function OrganizationSettings({
  canEdit,
  isOwner,
  isPersonal,
  organizationName,
}: OrganizationSettingsProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data } = useSuspenseQuery(
    trpc.organizations.members.list.queryOptions(),
  );
  const invites = useQuery({
    ...trpc.organizations.invites.list.queryOptions(),
    enabled: canEdit,
  });

  const onError = (error: { message: string }) => toast.error(error.message);
  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: trpc.organizations.members.list.queryKey(),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.organizations.invites.list.queryKey(),
    });
  };

  const [name, setName] = useState(organizationName);
  const rename = useMutation(
    trpc.organizations.rename.mutationOptions({
      onSuccess: () => {
        toast.success(t("organizations.settings.renamed"));
        router.refresh();
      },
      onError,
    }),
  );
  const updateRole = useMutation(
    trpc.organizations.members.updateRole.mutationOptions({
      onSuccess: () => {
        toast.success(t("organizations.settings.roleUpdated"));
        invalidate();
      },
      onError,
    }),
  );
  const remove = useMutation(
    trpc.organizations.members.remove.mutationOptions({
      onSuccess: () => {
        toast.success(t("organizations.settings.removed"));
        invalidate();
      },
      onError,
    }),
  );
  const revoke = useMutation(
    trpc.organizations.invites.revoke.mutationOptions({
      onSuccess: () => {
        toast.success(t("organizations.settings.revoked"));
        invalidate();
      },
      onError,
    }),
  );
  const leave = useMutation(
    trpc.organizations.leave.mutationOptions({
      onSuccess: () => {
        toast.success(t("organizations.settings.left"));
        router.push("/dashboard");
        router.refresh();
      },
      onError,
    }),
  );

  const seatsUsed = data.members.length + (invites.data?.length ?? 0);

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>{t("organizations.settings.name")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                rename.mutate({ name });
              }}
            >
              <Input
                aria-label={t("organizations.settings.name")}
                value={name}
                maxLength={128}
                onChange={(event) => setName(event.target.value)}
                className="max-w-sm"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={rename.isPending || name.trim() === organizationName}
              >
                {t("organizations.settings.rename")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{t("organizations.settings.members")}</CardTitle>
              <CardDescription>
                {data.unlimited
                  ? t("organizations.settings.seatsUnlimited")
                  : t("organizations.settings.seats", {
                      used: seatsUsed,
                      limit: data.seatLimit,
                    })}
              </CardDescription>
            </div>
            {canEdit && !isPersonal && (
              <InviteDialog
                seatsFull={
                  !data.seatsEnforced.unlimited &&
                  seatsUsed >= data.seatsEnforced.seatLimit
                }
                onInvited={invalidate}
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {data.members.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {member.user.name ?? member.user.email}
                    {member.isYou && (
                      <Badge variant="outline" className="ms-2">
                        {t("organizations.settings.you")}
                      </Badge>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {member.user.email} ·{" "}
                    {t("organizations.settings.joined", {
                      when: member.joinedAt,
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isOwner && !isPersonal && !member.isYou ? (
                    <Select
                      value={member.role}
                      onValueChange={(role) =>
                        role &&
                        updateRole.mutate({
                          userId: member.user.id,
                          role: role as OrganizationRole,
                        })
                      }
                    >
                      <SelectTrigger
                        className="w-32"
                        aria-label={t("organizations.settings.role")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {organizationRoleValues.map((role) => (
                          <SelectItem key={role} value={role}>
                            {t(`organizations.roles.${role}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline">
                      {t(`organizations.roles.${member.role}`)}
                    </Badge>
                  )}
                  {canEdit && !isPersonal && !member.isYou && (
                    <ConfirmButton
                      label={t("organizations.settings.remove")}
                      description={t("organizations.settings.removeConfirm", {
                        name: member.user.name ?? member.user.email,
                      })}
                      onConfirm={() =>
                        remove.mutate({ userId: member.user.id })
                      }
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {canEdit && !isPersonal && (
        <Card>
          <CardHeader>
            <CardTitle>{t("organizations.settings.invites")}</CardTitle>
          </CardHeader>
          <CardContent>
            {!invites.data || invites.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("organizations.settings.noInvites")}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {invites.data.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{invite.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {t(`organizations.roles.${invite.role}`)} ·{" "}
                        {t("organizations.settings.expires", {
                          when: invite.expiresAt,
                        })}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate({ id: invite.id })}
                    >
                      <XCircleIcon data-icon="inline-start" />
                      {t("organizations.settings.revoke")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {!isPersonal && (
        <div className="flex justify-end">
          <ConfirmButton
            label={t("organizations.settings.leave")}
            description={t("organizations.settings.leaveConfirm", {
              name: organizationName,
            })}
            onConfirm={() => leave.mutate()}
            variant="outline"
          />
        </div>
      )}
    </div>
  );
}

function ConfirmButton({
  label,
  description,
  onConfirm,
  variant = "ghost",
}: {
  label: string;
  description: string;
  onConfirm: () => void;
  variant?: "ghost" | "outline";
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant={variant} />}>
        {label}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{label}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const inviteSchema = z.object({
  email: z.email(translationKey("auth.validation.invalidEmail")),
  role: z.enum(["admin", "member"]),
});

function InviteDialog({
  seatsFull,
  onInvited,
}: {
  seatsFull: boolean;
  onInvited: () => void;
}) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<{ email: string; url: string } | null>(
    null,
  );

  const create = useMutation(
    trpc.organizations.invites.create.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          t("organizations.settings.invited", { email: result.email }),
        );
        onInvited();
        setOpen(false);
        form.reset();
        setIssued({ email: result.email, url: result.url });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const form = useAppForm({
    defaultValues: { email: "", role: "member" as "admin" | "member" },
    validators: { onSubmit: inviteSchema },
    onSubmit: ({ value }) => create.mutate(value),
  });

  const roleOptions = (["member", "admin"] as const).map((role) => ({
    value: role,
    label: t(`organizations.roles.${role}`),
  }));

  return (
    <>
      {seatsFull ? (
        <LinkButton href="/settings/billing" variant="outline">
          {t("organizations.settings.addSeat")}
        </LinkButton>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <UserPlusIcon data-icon="inline-start" />
            {t("organizations.settings.invite")}
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("organizations.settings.invite")}</DialogTitle>
            </DialogHeader>
            <OverlayFormBody
              formId={formId}
              onSubmit={(event) => {
                event.preventDefault();
                form.handleSubmit();
              }}
            >
              <FieldGroup>
                <form.AppField name="email">
                  {(field) => (
                    <field.EmailField
                      autoFocus
                      label={t("organizations.settings.inviteEmail")}
                      placeholder="colleague@example.com"
                    />
                  )}
                </form.AppField>
                <form.AppField name="role">
                  {(field) => (
                    <field.SelectField
                      label={t("organizations.settings.inviteRole")}
                      options={roleOptions}
                    />
                  )}
                </form.AppField>
              </FieldGroup>
            </OverlayFormBody>
            <DialogFooter>
              <OverlayFormFooterActions>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {t("actions.cancel")}
                </Button>
                <OverlayFormSubmitButton
                  formId={formId}
                  disabled={create.isPending}
                >
                  {t("organizations.settings.inviteSubmit")}
                </OverlayFormSubmitButton>
              </OverlayFormFooterActions>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={issued != null} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("organizations.settings.inviteLinkTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("organizations.settings.inviteLinkLead", {
                email: issued?.email ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              readOnly
              value={issued?.url ?? ""}
              className="font-mono text-xs"
            />
            <Button
              variant="outline"
              onClick={async () => {
                if (!issued) return;
                await navigator.clipboard.writeText(issued.url);
                toast.success(t("organizations.settings.copied"));
              }}
            >
              <CopyIcon data-icon="inline-start" />
              {t("organizations.settings.copyLink")}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setIssued(null)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
