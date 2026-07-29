import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

export interface ActivePlatformNotification {
  id: string;
  titleEn: string;
  titleZh: string;
  bodyEn: string;
  bodyZh: string;
  createdAt: Date;
}

/**
 * The reach rule, in one place: a notification reaches a user when it is
 * addressed to everyone, or the user is one of its selected targets. Both the
 * banner query and dismissal validation use this same fragment, so "can see
 * it" and "can dismiss it" cannot drift apart.
 */
export function notificationReachesWhere(
  userId: string
): Prisma.PlatformNotificationWhereInput {
  return {
    OR: [{ audience: "all" }, { targets: { some: { userId } } }]
  };
}

/**
 * Notifications to show this user right now: reaches them and not yet
 * dismissed by them. Resolved at read time — an "all" notification reaches
 * accounts created after it was sent, and deleting one retracts it
 * everywhere — matching the platform's read-time-over-jobs convention.
 */
export async function getActiveNotificationsForUser(
  userId: string
): Promise<ActivePlatformNotification[]> {
  return prisma.platformNotification.findMany({
    where: {
      ...notificationReachesWhere(userId),
      dismissals: { none: { userId } }
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      titleEn: true,
      titleZh: true,
      bodyEn: true,
      bodyZh: true,
      createdAt: true
    }
  });
}

export interface PlatformNotificationSummary {
  id: string;
  titleEn: string;
  titleZh: string;
  bodyEn: string;
  bodyZh: string;
  audience: string;
  emailRequested: boolean;
  createdAt: Date;
  /** Selected recipients; empty when audience is "all". */
  targets: { id: string; username: string; displayName: string }[];
  targetedCount: number;
  dismissedCount: number;
}

/** Admin list: every notification with its reach and dismissal counts. */
export async function getNotificationSummaries(): Promise<
  PlatformNotificationSummary[]
> {
  const [totalUsers, notifications] = await Promise.all([
    prisma.user.count(),
    prisma.platformNotification.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        targets: {
          select: {
            user: { select: { id: true, username: true, displayName: true } }
          }
        },
        _count: { select: { dismissals: true } }
      }
    })
  ]);

  return notifications.map((notification) => ({
    id: notification.id,
    titleEn: notification.titleEn,
    titleZh: notification.titleZh,
    bodyEn: notification.bodyEn,
    bodyZh: notification.bodyZh,
    audience: notification.audience,
    emailRequested: notification.emailRequested,
    createdAt: notification.createdAt,
    targets: notification.targets.map((target) => target.user),
    targetedCount:
      notification.audience === "all" ? totalUsers : notification.targets.length,
    dismissedCount: notification._count.dismissals
  }));
}

/**
 * Record that a user dismissed a notification. Silent no-op when the
 * notification does not exist or does not reach this user — idempotent, and
 * indistinguishable from a foreign id so ids cannot be probed.
 */
export async function dismissNotificationForUser(
  userId: string,
  notificationId: string
): Promise<void> {
  const reachable = await prisma.platformNotification.findFirst({
    where: { id: notificationId, ...notificationReachesWhere(userId) },
    select: { id: true }
  });
  if (!reachable) return;

  await prisma.platformNotificationDismissal.upsert({
    where: { notificationId_userId: { notificationId, userId } },
    create: { notificationId, userId },
    update: {}
  });
}
