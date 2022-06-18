import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const order1 = await prisma.order.upsert({
    where: {
      hash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    },
    update: {},
    create: {
      hash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      offer: {
        create: {
          itemType: 1,
          token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          identifierOrCriteria: '0',
          startAmount: '100000000000000000',
          endAmount: '100000000000000000'
        },
      },
      consideration: {
        create: [
          {
            itemType: 4,
            token: '0x3F53082981815Ed8142384EDB1311025cA750Ef1',
            identifierOrCriteria: '0',
            startAmount: '1',
            endAmount: '1',
            recipient: '0xf0E16c071E2cd421974dCb76d9af4DeDB578E059'
          },
          {
            itemType: 1,
            token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            identifierOrCriteria: '0',
            startAmount: '2500000000000000',
            endAmount: '2500000000000000',
            recipient: '0x8De9C5A032463C561423387a9648c5C7BCC5BC90'
          }
        ]
      },
      offerer: '0xf0E16c071E2cd421974dCb76d9af4DeDB578E059',
      startTime: 0,
      endTime: 1655678640,
      orderType: 2,
      zone: '0x004C00500000aD104D7DBd00e3ae0A5C00560C00',
      zoneHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      salt: '23533917286439089',
      conduitKey: '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000',
      counter: 0,
      signature: '0x0000000000000000000000000000000000000000000000000000000000000000',
      chainId: '1',
      metadata: {
        create: {
          isValid: true,
          isExpired: false,
          isCancelled: false,
          isPinned: false,
          isRemoved: false,
          lastValidatedBlockNumber: '1000000',
          lastValidatedBlockHash: '0x0000000000000000000000000000000000000000000000000000000000000000'
        }
      }
    },
  })

  const order2 = await prisma.order.upsert({
    where: {
      hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
    },
    update: {},
    create: {
      hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
      offer: {
        create: {
          itemType: 1,
          token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          identifierOrCriteria: '0',
          startAmount: '200000000000000000',
          endAmount: '200000000000000000'
        },
      },
      consideration: {
        create: [
          {
            itemType: 4,
            token: '0x3F53082981815Ed8142384EDB1311025cA750Ef1',
            identifierOrCriteria: '0',
            startAmount: '1',
            endAmount: '1',
            recipient: '0xf0E16c071E2cd421974dCb76d9af4DeDB578E059'
          },
          {
            itemType: 1,
            token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            identifierOrCriteria: '0',
            startAmount: '5000000000000000',
            endAmount: '5000000000000000',
            recipient: '0x8De9C5A032463C561423387a9648c5C7BCC5BC90'
          }
        ]
      },
      offerer: '0xf0E16c071E2cd421974dCb76d9af4DeDB578E059',
      startTime: 0,
      endTime: 1455678640,
      orderType: 2,
      zone: '0x004C00500000aD104D7DBd00e3ae0A5C00560C00',
      zoneHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      salt: '23533917286439089',
      conduitKey: '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000',
      counter: 0,
      signature: '0x0000000000000000000000000000000000000000000000000000000000000000',
      chainId: '1',
      metadata: {
        create: {
          isValid: false,
          isExpired: true,
          isCancelled: false,
          isPinned: true,
          isRemoved: false,
        }
      }
    },
  })

  console.log({ order1, order2 })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
