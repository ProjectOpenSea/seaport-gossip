-- CreateTable
CREATE TABLE "OfferItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemType" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "identifierOrCriteria" TEXT NOT NULL,
    "startAmount" BIGINT NOT NULL,
    "endAmount" BIGINT NOT NULL,
    "orderHash" TEXT NOT NULL,
    CONSTRAINT "OfferItem_orderHash_fkey" FOREIGN KEY ("orderHash") REFERENCES "Order" ("hash") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsiderationItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemType" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "identifierOrCriteria" TEXT NOT NULL,
    "startAmount" BIGINT NOT NULL,
    "endAmount" BIGINT NOT NULL,
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
    "numerator" BIGINT,
    "denominator" BIGINT,
    "extraData" TEXT,
    "chainId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "OrderMetadata" (
    "orderHash" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isValid" BOOLEAN NOT NULL,
    "isExpired" BOOLEAN NOT NULL,
    "isCancelled" BOOLEAN NOT NULL,
    "isAuction" BOOLEAN NOT NULL,
    "isFullyFulfilled" BOOLEAN NOT NULL,
    "lastFulfilledAt" DATETIME,
    "lastFulfilledPrice" BIGINT,
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
    "hash" TEXT NOT NULL PRIMARY KEY
);

-- CreateTable
CREATE TABLE "CriteriaTokenId" (
    "tokenId" BIGINT NOT NULL PRIMARY KEY
);

-- CreateTable
CREATE TABLE "TokenIdForCriteria" (
    "criteriaHash" TEXT NOT NULL,
    "tokenId" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("criteriaHash", "tokenId"),
    CONSTRAINT "TokenIdForCriteria_criteriaHash_fkey" FOREIGN KEY ("criteriaHash") REFERENCES "Criteria" ("hash") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TokenIdForCriteria_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "CriteriaTokenId" ("tokenId") ON DELETE CASCADE ON UPDATE CASCADE
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
