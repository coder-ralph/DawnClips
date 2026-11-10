"use client";

import { Bell, Heart, MessageCircle, Reply, UserPlus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-container";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/video";

type Notice = {
  id: string;
  type: "like" | "comment" | "reply" | "follow";
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
  username: string | null;
  display_name: string | null;
  avatar_url?: string | null;
};

const labels: Record<Notice["type"], string> = {
  like: "liked your clip",
  comment: "commented on your clip",
  reply: "replied to your comment",
  follow: "started following you",
};

const icons: Record<Notice["type"], { icon: LucideIcon; className: string }> = {
  like: { icon: Heart, className: "bg-like text-background" },
  comment: { icon: MessageCircle, className: "bg-accent text-accent-fg" },
  reply: { icon: Reply, className: "bg-accent text-accent-fg" },
  follow: { icon: UserPlus, className: "bg-foreground text-background" },
};

function noticeHref(item: Notice) {
  if (item.type === "follow") return item.username ? `/profile/${item.username}` : "/notifications";
  if (!item.reference_id) return "/notifications";
  return item.type === "like" ? `/clip/${item.reference_id}` : `/clip/${item.reference_id}#comments`;
}

export function NotificationList({ initial }: { initial: Notice[] }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [pending, setPending] = useState(false);
  const unread = items.filter((item) => !item.is_read).length;

  async function mark(id?: string) {
    const previous = items;
    setItems((current) => current.map((item) => (!id || item.id === id ? { ...item, is_read: true } : item)));
    if (!id) setPending(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : {}),
        keepalive: true,
      });
      if (!response.ok) throw new Error("failed");
    } catch {
      setItems(previous);
      toast("Could not update notifications.", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : "You are all caught up."}
        actions={
          <Button size="sm" variant="secondary" loading={pending} disabled={unread === 0} onClick={() => void mark()}>
            Mark all as read
          </Button>
        }
      />
      {items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet" body="Likes, comments and new followers will show up here." />
      ) : (
        <ul className="border-t">
          {items.map((item) => {
            // like/comment/reply reference the clip; follow references the follower, so it opens their profile.
            const href = noticeHref(item);
            const { icon: Icon, className } = icons[item.type];
            const name = item.display_name ?? "Someone";
            return (
              <li key={item.id} className="relative border-b">
                <Link
                  href={href}
                  onClick={() => {
                    if (!item.is_read) void mark(item.id);
                  }}
                  className={cn("flex items-center gap-3 px-4 py-3.5 pr-12 transition-colors hover:bg-hover md:px-5 md:pr-14", !item.is_read && "bg-accent-soft")}
                >
                  <span className="relative shrink-0">
                    <Avatar src={item.avatar_url} name={name} size={44} />
                    <span className={cn("absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-background", className)}>
                      <Icon aria-hidden="true" className="h-3 w-3" fill={item.type === "like" ? "currentColor" : "none"} />
                    </span>
                  </span>
                  <span className="min-w-0 text-[15px] leading-5">
                    <span className="font-semibold">{name}</span> {labels[item.type]}
                    <span className="block text-xs text-muted">
                      <time dateTime={item.created_at} suppressHydrationWarning>{formatRelativeTime(item.created_at)}</time>
                    </span>
                  </span>
                </Link>
                {!item.is_read ? (
                  <button
                    type="button"
                    onClick={() => void mark(item.id)}
                    aria-label={`Mark notification from ${name} as read`}
                    className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full hover:bg-active md:right-3"
                  >
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-accent-text" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
