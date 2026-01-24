-- CreateTable
CREATE TABLE "public"."webhook_events" (
    "id" VARCHAR(64) NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_events_received_at_idx" ON "public"."webhook_events"("received_at");
