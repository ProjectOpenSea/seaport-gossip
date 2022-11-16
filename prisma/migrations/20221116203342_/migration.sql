-- CreateTable
CREATE TABLE "OfferItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemType" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "identifierOrCriteria" TEXT NOT NULL,
    "startAmount" TEXT NOT NULL,
    "endAmount" TEXT NOT NULL,
    "orderHash" TEXT NOT NULL,
    CONSTRAINT "OfferItem_orderHash_fkey" FOREIGN KEY ("orderHash") REFERENCES "Order" ("hash") ON DELETE CASCADE ON UPDATE CASCADE
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
    CONSTRAINT "ConsiderationItem_orderHash_fkey" FOREIGN KEY ("orderHash") REFERENCES "Order" ("hash") ON DELETE CASCADE ON UPDATE CASCADE
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
    "numerator" TEXT,
    "denominator" TEXT,
    "extraData" TEXT,
    "chainId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "OrderMetadata" (
    "orderHash" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isValid" BOOLEAN NOT NULL,
    "isAuction" BOOLEAN NOT NULL,
    "isFullyFulfilled" BOOLEAN NOT NULL,
    "lastFulfilledAt" TEXT,
    "lastFulfilledPrice" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isRemoved" BOOLEAN NOT NULL DEFAULT false,
    "lastValidatedBlockNumber" TEXT,
    "lastValidatedBlockHash" TEXT,
    CONSTRAINT "OrderMetadata_orderHash_fkey" FOREIGN KEY ("orderHash") REFERENCES "Order" ("hash") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NodeStatus" (
    "chainId" TEXT NOT NULL PRIMARY KEY,
    "ethRPCRequestsSentInCurrentUTCDay" INTEGER NOT NULL DEFAULT 0,
    "startOfCurrentUTCDay" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Criteria" (
    "hash" TEXT NOT NULL PRIMARY KEY,
    "tokenIds" TEXT NOT NULL,
    "token" TEXT NOT NULL
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

-- CreateTable
CREATE TABLE "ERC20TokenPrices" (
    "token" TEXT NOT NULL PRIMARY KEY,
    "usdPricePerToken" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_hash_key" ON "Order"("hash");
