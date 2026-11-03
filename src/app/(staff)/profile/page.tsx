import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getMyProfile } from "@/lib/data/profile";
import { createClient } from "@/lib/supabase/server";
import { DetailsForm, PasswordForm, PhotoForm, SignOutEverywhere, TwoStepSignIn } from "./profile-forms";

export const metadata: Metadata = { title: "Profile" };

const ROLE_LABEL = { owner: "Owner", mechanic: "Mechanic" } as const;

/** Every active staff member, own profile only (PLAN Phase 5). getMyProfile sends signed-out visitors to /login. */
export default async function ProfilePage() {
  const profile = await getMyProfile();
  // Verified TOTP factors only (listFactors asks Auth): an unfinished set-up does not count as on (D-110).
  const { data: factors } = await (await createClient()).auth.mfa.listFactors();
  const twoStepOn = (factors?.totp.length ?? 0) > 0;

  return (
    <div className="max-w-3xl">
      <PageHeader title="Profile" description="How your colleagues see you, and how you sign in." />
      <div className="grid gap-6">
        <Card>
          <CardHeader className="items-center">
            <CardTitle>Your details</CardTitle>
            <Badge tone={profile.role === "owner" ? "accent" : "neutral"}>{ROLE_LABEL[profile.role]}</Badge>
          </CardHeader>
          <CardContent className="grid gap-6">
            <PhotoForm name={profile.fullName} avatarUrl={profile.avatarUrl} />
            <div className="border-t border-rule pt-6">
              <DetailsForm fullName={profile.fullName} phone={profile.phone} about={profile.about} email={profile.email} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Change password</CardTitle>
              <CardDescription className="mt-1">Enter your current password to choose a new one.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Two-step sign-in</CardTitle>
              <CardDescription className="mt-1">
                {twoStepOn
                  ? "Each sign-in asks for your password and a code from the authenticator app on your phone."
                  : "Ask for a code from an authenticator app on your phone at each sign-in, so a password alone is not enough."}
              </CardDescription>
            </div>
            <Badge tone={twoStepOn ? "success" : "neutral"}>{twoStepOn ? "On" : "Off"}</Badge>
          </CardHeader>
          <CardContent>
            <TwoStepSignIn on={twoStepOn} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Sign out everywhere</CardTitle>
              <CardDescription className="mt-1">
                Lost a phone, or signed in on a shared computer? This ends every session of your account, this one
                included.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <SignOutEverywhere />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
