-- Platform admins' own wording for menu text, edited in place on the new site.
CREATE TABLE "TextOverride" (
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TextOverride_pkey" PRIMARY KEY ("key","locale")
);
