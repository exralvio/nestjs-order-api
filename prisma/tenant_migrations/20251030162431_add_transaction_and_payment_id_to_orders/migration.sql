-- Migration: Add nullable transaction_id and payment_id to orders table
ALTER TABLE "orders" ADD COLUMN "paymentId" TEXT;
ALTER TABLE "orders" ADD COLUMN "transactionId" TEXT;
