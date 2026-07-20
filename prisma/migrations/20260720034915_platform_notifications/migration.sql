-- CreateTable
CREATE TABLE "PlatformNotification" (
    "id" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL DEFAULT '',
    "titleZh" TEXT NOT NULL DEFAULT '',
    "bodyEn" TEXT NOT NULL DEFAULT '',
    "bodyZh" TEXT NOT NULL DEFAULT '',
    "audience" TEXT NOT NULL DEFAULT 'all',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformNotificationTarget" (
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "PlatformNotificationTarget_pkey" PRIMARY KEY ("notificationId","userId")
);

-- CreateTable
CREATE TABLE "PlatformNotificationDismissal" (
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformNotificationDismissal_pkey" PRIMARY KEY ("notificationId","userId")
);

-- CreateIndex
CREATE INDEX "PlatformNotificationTarget_userId_idx" ON "PlatformNotificationTarget"("userId");

-- CreateIndex
CREATE INDEX "PlatformNotificationDismissal_userId_idx" ON "PlatformNotificationDismissal"("userId");

-- AddForeignKey
ALTER TABLE "PlatformNotificationTarget" ADD CONSTRAINT "PlatformNotificationTarget_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "PlatformNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformNotificationTarget" ADD CONSTRAINT "PlatformNotificationTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformNotificationDismissal" ADD CONSTRAINT "PlatformNotificationDismissal_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "PlatformNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformNotificationDismissal" ADD CONSTRAINT "PlatformNotificationDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
