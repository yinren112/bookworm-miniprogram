-- CreateTable: UserProfile
-- Stores user profile information collected during acquisition flow
CREATE TABLE "UserProfile" (
    "user_id" INTEGER NOT NULL,
    "phone_number" VARCHAR(20),
    "enrollment_year" INTEGER,
    "major" VARCHAR(100),
    "class_name" VARCHAR(50),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable: RecommendedBookList
-- Defines which book combinations are recommended for a specific enrollment year + major
CREATE TABLE "RecommendedBookList" (
    "id" SERIAL NOT NULL,
    "enrollment_year" INTEGER NOT NULL,
    "major" VARCHAR(100) NOT NULL,

    CONSTRAINT "RecommendedBookList_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RecommendedBookItem
-- Links specific SKUs to a recommendation list
CREATE TABLE "RecommendedBookItem" (
    "list_id" INTEGER NOT NULL,
    "sku_id" INTEGER NOT NULL,

    CONSTRAINT "RecommendedBookItem_pkey" PRIMARY KEY ("list_id","sku_id")
);

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendedBookItem" ADD CONSTRAINT "RecommendedBookItem_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "RecommendedBookList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendedBookItem" ADD CONSTRAINT "RecommendedBookItem_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "booksku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex: Unique constraint on (enrollment_year, major)
CREATE UNIQUE INDEX "RecommendedBookList_enrollment_year_major_key" ON "RecommendedBookList"("enrollment_year", "major");

-- CreateIndex: For efficient lookup of recommendations
CREATE INDEX "RecommendedBookList_enrollment_year_idx" ON "RecommendedBookList"("enrollment_year");

-- CreateIndex: For efficient reverse lookup (which lists contain this SKU)
CREATE INDEX "RecommendedBookItem_sku_id_idx" ON "RecommendedBookItem"("sku_id");
