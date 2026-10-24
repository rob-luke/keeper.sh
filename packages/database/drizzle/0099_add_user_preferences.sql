CREATE TABLE "user_preferences" (
	"homeTimeZone" text,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"userId" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;