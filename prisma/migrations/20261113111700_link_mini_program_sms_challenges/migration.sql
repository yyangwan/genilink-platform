-- AddForeignKey
ALTER TABLE "SmsVerificationCode" ADD CONSTRAINT "SmsVerificationCode_miniProgramBindingId_fkey" FOREIGN KEY ("miniProgramBindingId") REFERENCES "MiniProgramBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
