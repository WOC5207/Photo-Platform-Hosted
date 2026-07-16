-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "status" TEXT NOT NULL DEFAULT 'active',
    "displayName" TEXT NOT NULL DEFAULT '',
    "quotaBytes" BIGINT NOT NULL DEFAULT 5368709120,
    "usedBytes" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteImage" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "redeemedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleZh" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "descriptionZh" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "dateStart" TIMESTAMP(3),
    "dateEnd" TIMESTAMP(3),
    "published" BOOLEAN NOT NULL DEFAULT false,
    "coverPhotoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "exifFocalLengthMm" DOUBLE PRECISION,
    "exifAperture" DOUBLE PRECISION,
    "exifExposureTime" DOUBLE PRECISION,
    "exifIso" INTEGER,
    "exifTakenAt" TIMESTAMP(3),
    "exifCameraModel" TEXT,
    "exifLensModel" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "homeHighlight" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoCredit" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "creditName" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PhotoCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialLink" (
    "id" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SocialLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditProfile" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "creditName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditProfileSocialLink" (
    "id" TEXT NOT NULL,
    "creditProfileId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CreditProfileSocialLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingEvent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleZh" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "descriptionZh" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "date" TIMESTAMP(3) NOT NULL,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "lotteryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeSlot" (
    "id" TEXT NOT NULL,
    "bookingEventId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "descriptionZh" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "TimeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "siteTitleEn" TEXT NOT NULL DEFAULT '',
    "siteTitleZh" TEXT NOT NULL DEFAULT '',
    "homeTitleEn" TEXT NOT NULL DEFAULT '',
    "homeTitleZh" TEXT NOT NULL DEFAULT '',
    "homeSubtitleEn" TEXT NOT NULL DEFAULT '',
    "homeSubtitleZh" TEXT NOT NULL DEFAULT '',
    "backgroundColor" TEXT NOT NULL DEFAULT '',
    "backgroundImage" TEXT NOT NULL DEFAULT '',
    "logo" TEXT NOT NULL DEFAULT '',
    "creditTermEn" TEXT NOT NULL DEFAULT '',
    "creditTermZh" TEXT NOT NULL DEFAULT '',
    "subjectTermEn" TEXT NOT NULL DEFAULT '',
    "subjectTermZh" TEXT NOT NULL DEFAULT '',
    "homeCreditsLabelEn" TEXT NOT NULL DEFAULT '',
    "homeCreditsLabelZh" TEXT NOT NULL DEFAULT '',
    "bookingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lotteryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "creditProfilesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "announcementsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "contactEnabled" BOOLEAN NOT NULL DEFAULT false,
    "contactTitleEn" TEXT NOT NULL DEFAULT '',
    "contactTitleZh" TEXT NOT NULL DEFAULT '',
    "contactUrlEn" TEXT NOT NULL DEFAULT '',
    "contactUrlZh" TEXT NOT NULL DEFAULT '',
    "contactQrImageEn" TEXT NOT NULL DEFAULT '',
    "contactQrImageZh" TEXT NOT NULL DEFAULT '',
    "setupCompleted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalLink" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelZh" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMethod" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelZh" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleZh" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL DEFAULT '',
    "bodyZh" TEXT NOT NULL DEFAULT '',
    "image" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "timeSlotId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "contactMethod" TEXT NOT NULL DEFAULT '',
    "contactValue" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "cancelToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotteryDraw" (
    "id" TEXT NOT NULL,
    "bookingEventId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LotteryDraw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotteryEntry" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "bookingId" TEXT,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "contactMethod" TEXT NOT NULL DEFAULT '',
    "contactValue" TEXT NOT NULL DEFAULT '',
    "token" TEXT NOT NULL,
    "wonPrizeId" TEXT,
    "wonAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotteryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotteryPrize" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotteryPrize_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "SiteImage_token_key" ON "SiteImage"("token");

-- CreateIndex
CREATE INDEX "SiteImage_ownerId_idx" ON "SiteImage"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_code_key" ON "Invite"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_redeemedById_key" ON "Invite"("redeemedById");

-- CreateIndex
CREATE INDEX "Invite_issuedById_idx" ON "Invite"("issuedById");

-- CreateIndex
CREATE UNIQUE INDEX "Event_coverPhotoId_key" ON "Event"("coverPhotoId");

-- CreateIndex
CREATE INDEX "Event_ownerId_idx" ON "Event"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_ownerId_slug_key" ON "Event"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "CreditProfile_ownerId_idx" ON "CreditProfile"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditProfile_ownerId_creditName_key" ON "CreditProfile"("ownerId", "creditName");

-- CreateIndex
CREATE UNIQUE INDEX "BookingEvent_token_key" ON "BookingEvent"("token");

-- CreateIndex
CREATE INDEX "BookingEvent_ownerId_idx" ON "BookingEvent"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteSettings_ownerId_key" ON "SiteSettings"("ownerId");

-- CreateIndex
CREATE INDEX "PersonalLink_ownerId_idx" ON "PersonalLink"("ownerId");

-- CreateIndex
CREATE INDEX "ContactMethod_ownerId_idx" ON "ContactMethod"("ownerId");

-- CreateIndex
CREATE INDEX "Announcement_ownerId_idx" ON "Announcement"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_cancelToken_key" ON "Booking"("cancelToken");

-- CreateIndex
CREATE UNIQUE INDEX "LotteryDraw_bookingEventId_key" ON "LotteryDraw"("bookingEventId");

-- CreateIndex
CREATE UNIQUE INDEX "LotteryDraw_token_key" ON "LotteryDraw"("token");

-- CreateIndex
CREATE UNIQUE INDEX "LotteryEntry_bookingId_key" ON "LotteryEntry"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "LotteryEntry_drawId_token_key" ON "LotteryEntry"("drawId", "token");

-- AddForeignKey
ALTER TABLE "SiteImage" ADD CONSTRAINT "SiteImage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_redeemedById_fkey" FOREIGN KEY ("redeemedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_coverPhotoId_fkey" FOREIGN KEY ("coverPhotoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoCredit" ADD CONSTRAINT "PhotoCredit_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialLink" ADD CONSTRAINT "SocialLink_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "PhotoCredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditProfile" ADD CONSTRAINT "CreditProfile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditProfileSocialLink" ADD CONSTRAINT "CreditProfileSocialLink_creditProfileId_fkey" FOREIGN KEY ("creditProfileId") REFERENCES "CreditProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_bookingEventId_fkey" FOREIGN KEY ("bookingEventId") REFERENCES "BookingEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteSettings" ADD CONSTRAINT "SiteSettings_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalLink" ADD CONSTRAINT "PersonalLink_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMethod" ADD CONSTRAINT "ContactMethod_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "TimeSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotteryDraw" ADD CONSTRAINT "LotteryDraw_bookingEventId_fkey" FOREIGN KEY ("bookingEventId") REFERENCES "BookingEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotteryEntry" ADD CONSTRAINT "LotteryEntry_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "LotteryDraw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotteryEntry" ADD CONSTRAINT "LotteryEntry_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotteryEntry" ADD CONSTRAINT "LotteryEntry_wonPrizeId_fkey" FOREIGN KEY ("wonPrizeId") REFERENCES "LotteryPrize"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotteryPrize" ADD CONSTRAINT "LotteryPrize_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "LotteryDraw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

