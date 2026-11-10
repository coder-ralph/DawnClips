"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useActionState } from "react";
import { updatePreferences } from "@/app/(main)/settings/preferences-action";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { languages, translate, type Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Settings = {
  theme: "light" | "dark" | "system";
  language: Language;
  showHighlights: boolean;
  showFollowing: boolean;
  showFollowers: boolean;
  showComments: boolean;
  showLikes: boolean;
  autoplay: boolean;
  defaultMuted: boolean;
  inAppNotifications: boolean;
  notifyLikes: boolean;
  notifyComments: boolean;
  notifyReplies: boolean;
  notifyFollows: boolean;
};

const initial: { status: string; message?: string } = { status: "idle" };

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="border-t px-4 py-6 md:px-5">
      <h2 className="text-base font-bold">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function PreferencesForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(updatePreferences, initial);
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.language, key);
  const themes = [
    { value: "dark", label: t("themeDark"), icon: Moon },
    { value: "light", label: t("themeLight"), icon: Sun },
    { value: "system", label: t("themeSystem"), icon: Monitor },
  ] as const;

  return (
    <form action={action}>
      <Section title={t("appearance")}>
        <fieldset>
          <legend className="sr-only">{t("appearance")}</legend>
          <div className="grid grid-cols-3 gap-2">
            {themes.map(({ value, label, icon: Icon }) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-line px-3 py-3 text-sm font-medium transition-colors hover:bg-hover",
                  "has-[:checked]:border-accent-text has-[:checked]:bg-accent-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-text",
                )}
              >
                <input type="radio" name="theme" value={value} defaultChecked={settings.theme === value} className="sr-only" />
                <Icon aria-hidden="true" className="h-5 w-5" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={t("language")} className="mt-4">
          <select name="language" defaultValue={settings.language} className={inputClass}>
            {languages.map((language) => (
              <option key={language.code} value={language.code}>{language.label}</option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title={t("privacy")} description="Choose what other people can see on your profile.">
        <div className="divide-y">
          <Switch name="showHighlights" label="Highlights" description="Your published clips." defaultChecked={settings.showHighlights} />
          <Switch name="showFollowing" label="Following list" defaultChecked={settings.showFollowing} />
          <Switch name="showFollowers" label="Follower list" defaultChecked={settings.showFollowers} />
          <Switch name="showComments" label="Comments" defaultChecked={settings.showComments} />
          <Switch name="showLikes" label="Likes" defaultChecked={settings.showLikes} />
        </div>
      </Section>

      <Section title={t("playback")}>
        <div className="divide-y">
          <Switch name="autoplay" label="Autoplay visible clips" description="Plays the clip in view. Off when your device prefers reduced motion." defaultChecked={settings.autoplay} />
          <Switch name="defaultMuted" label="Start muted" defaultChecked={settings.defaultMuted} />
        </div>
      </Section>

      <Section title={t("notifications")}>
        <div className="divide-y">
          <Switch name="inAppNotifications" label="In-app notifications" description="Turn this off to stop all notifications." defaultChecked={settings.inAppNotifications} />
          <Switch name="notifyLikes" label="Likes" defaultChecked={settings.notifyLikes} />
          <Switch name="notifyComments" label="Comments" defaultChecked={settings.notifyComments} />
          <Switch name="notifyReplies" label="Replies" defaultChecked={settings.notifyReplies} />
          <Switch name="notifyFollows" label="New followers" defaultChecked={settings.notifyFollows} />
        </div>
      </Section>

      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 flex items-center gap-4 border-t bg-background/95 px-4 py-3 backdrop-blur md:bottom-0 md:px-5">
        <Button type="submit" loading={pending}>{pending ? "Saving…" : t("save")}</Button>
        {state.status === "error" ? <p className="text-sm text-danger" role="alert">{state.message}</p> : null}
        {state.status === "success" ? <p className="text-sm text-success" role="status">{t("saved")}</p> : null}
      </div>
    </form>
  );
}
