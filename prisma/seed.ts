import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

interface UserSeed {
  email: string;
  username: string;
  password: string;
  role: Role;
}

async function main() {
  // Array of users to seed
  const users: UserSeed[] = [
    {
      email: 'admin@provenant.eu',
      username: 'admin',
      password: 'admin123',
      role: 'ADMIN',
    },
    {
      email: 'customer@provenant.eu',
      username: 'customer',
      password: 'customer123',
      role: 'CUSTOMER',
    },
  ];

  // Loop through each user in the array
  for (const userData of users) {
    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: userData.email },
          { username: userData.username },
        ],
      },
    });

    if (existingUser) {
      console.log('User already exists:', {
        id: existingUser.id,
        email: existingUser.email,
        username: existingUser.username,
        role: existingUser.role,
      });
      continue;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: userData.email,
        username: userData.username,
        password: hashedPassword,
        role: userData.role,
      },
    });

    console.log('User created successfully:', {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    });
  }

  console.log(`\nSeeding completed. Processed ${users.length} user(s).`);
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
