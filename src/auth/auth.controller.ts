import { Controller, Post, Body, UseGuards, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register user' })
  @ApiBody({
    description: 'User registration credentials',
    type: RegisterDto,
    examples: {
      admin: {
        summary: 'Admin registration example',
        value: {
          email: 'admin@provenant.eu',
          username: 'admin',
          password: 'admin123',
        },
      },
      customer: {
        summary: 'Customer registration example',
        value: {
          email: 'customer@provenant.eu',
          username: 'customer',
          password: 'customer123',
        },
      },
    },
  })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login user' })
  @ApiBody({
    description: 'User login credentials',
    type: LoginDto,
    examples: {
      admin: {
        summary: 'Admin login example',
        value: {
          email: 'admin@provenant.eu',
          password: 'admin123',
        },
      },
      customer: {
        summary: 'Customer login example',
        value: {
          email: 'customer@provenant.eu',
          password: 'customer123',
        },
      },
    },
  })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiOperation({ summary: 'Get user profile' })
  getProfile(@GetUser() user: any) {
    return user;
  }
}

