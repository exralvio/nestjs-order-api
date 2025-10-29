import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

interface UserSeed {
  email: string;
  username: string;
  password: string;
  role: Role;
}

interface ProductSeed {
  name: string;
  description?: string;
  price: number;
  stock: number;
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

  console.log(`\nUser seeding completed. Processed ${users.length} user(s).`);

  // // Array of products to seed
  // const products: ProductSeed[] = [
  //   {
  //     name: 'Laptop Pro 15"',
  //     description: 'High-performance laptop with 16GB RAM and 512GB SSD. Perfect for professionals and developers.',
  //     price: 1299.99,
  //     stock: 25,
  //   },
  //   {
  //     name: 'Wireless Mouse',
  //     description: 'Ergonomic wireless mouse with precision tracking and long battery life.',
  //     price: 29.99,
  //     stock: 150,
  //   },
  //   {
  //     name: 'Mechanical Keyboard',
  //     description: 'RGB backlit mechanical keyboard with Cherry MX switches. Ideal for gaming and typing.',
  //     price: 149.99,
  //     stock: 50,
  //   },
  //   {
  //     name: '27" 4K Monitor',
  //     description: 'Ultra HD 4K monitor with HDR support and USB-C connectivity.',
  //     price: 599.99,
  //     stock: 30,
  //   },
  //   {
  //     name: 'Webcam HD 1080p',
  //     description: 'High-definition webcam with autofocus and built-in microphone for crystal-clear video calls.',
  //     price: 79.99,
  //     stock: 75,
  //   },
  // ];

  // // Loop through each product in the array
  // for (const productData of products) {
  //   // Check if product already exists
  //   const existingProduct = await prisma.product.findFirst({
  //     where: {
  //       name: productData.name,
  //     },
  //   });

  //   if (existingProduct) {
  //     console.log('Product already exists:', {
  //       id: existingProduct.id,
  //       name: existingProduct.name,
  //       price: existingProduct.price,
  //       stock: existingProduct.stock,
  //     });
  //     continue;
  //   }

  //   // Create product
  //   const product = await prisma.product.create({
  //     data: {
  //       name: productData.name,
  //       description: productData.description,
  //       price: productData.price,
  //       stock: productData.stock,
  //     },
  //   });

  //   console.log('Product created successfully:', {
  //     id: product.id,
  //     name: product.name,
  //     price: product.price,
  //     stock: product.stock,
  //   });
  // }

  // console.log(`\nProduct seeding completed. Processed ${products.length} product(s).`);
  // console.log(`\nSeeding completed. Processed ${users.length} user(s) and ${products.length} product(s).`);
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
