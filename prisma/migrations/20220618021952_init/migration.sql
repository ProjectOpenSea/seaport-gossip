-- CreateTable
CREATE TABLE "OfferItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemType" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "identifierOrCriteria" TEXT NOT NULL,
    "startAmount" TEXT NOT NULL,
    "endAmount" TEXT NOT NULL,
    "orderHash" TEXT NOT NULL,
    CONSTRAINT "OfferItem_orderHash_fkey" FOREIGN KEY ("orderHash") REFERENCES "Order" ("hash") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsiderationItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemType" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "identifierOrCriteria" TEXT NOT NULL,
    "startAmount" TEXT NOT NULL,
    "endAmount" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "orderHash" TEXT NOT NULL,
    CONSTRAINT "ConsiderationItem_orderHash_fkey" FOREIGN KEY ("orderHash") REFERENCES "Order" ("hash") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Order" (
    "hash" TEXT NOT NULL PRIMARY KEY,
    "offerer" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "orderType" INTEGER NOT NULL,
    "startTime" INTEGER NOT NULL,
    "endTime" INTEGER NOT NULL,
    "counter" INTEGER NOT NULL,
    "salt" TEXT NOT NULL,
    "conduitKey" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "zoneHash" TEXT NOT NULL,
    "additionalRecipients" TEXT,
    "numerator" INTEGER,
    "denominator" INTEGER,
    "extraData" TEXT,
    "chainId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "OrderMetadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isValid" BOOLEAN NOT NULL,
    "isExpired" BOOLEAN NOT NULL,
    "isCancelled" BOOLEAN NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isRemoved" BOOLEAN NOT NULL DEFAULT false,
    "lastValidatedBlockNumber" TEXT,
    "lastValidatedBlockHash" TEXT,
    "ethRPCRequestsSentInCurrentUTCDay" INTEGER NOT NULL DEFAULT 0,
    "startOfCurrentUTCDay" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderHash" TEXT NOT NULL,
    CONSTRAINT "OrderMetadata_orderHash_fkey" FOREIGN KEY ("orderHash") REFERENCES "Order" ("hash") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PeerStore" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "data" BLOB NOT NULL
);

-- CreateTable
CREATE TABLE "DHT" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "data" BLOB NOT NULL
);

-- CreateTable
CREATE TABLE "EthHeaders" (
    "hash" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "parent" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "logs" BLOB NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_hash_key" ON "Order"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "OrderMetadata_orderHash_key" ON "OrderMetadata"("orderHash");
