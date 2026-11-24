-- Kein erzwungener Passwortwechsel mehr nach dem ersten Login
UPDATE "User" SET "mustChangePassword" = false;
