import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./core/http-exception.filter";
import * as express from "express";
import * as os from "os";

async function bootstrap() {
  try {
    console.log('Starting API server...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'NOT SET');
    
    const app = await NestFactory.create(AppModule, {
      bodyParser: true,
      rawBody: false,
    });
    
    // Increase body size limit for photo uploads (10MB)
    // NestJS uses express under the hood, so we can access the underlying express app
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.use(express.json({ limit: '10mb' }));
    expressApp.use(express.urlencoded({ limit: '10mb', extended: true }));

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      })
    );

    // Add global exception filter for better error messages
    app.useGlobalFilters(new HttpExceptionFilter());

    app.setGlobalPrefix("api");
    app.enableCors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
          return callback(null, true);
        }
        
        const allowedOrigins = [
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3000",
        "http://localhost:3002",
        // Add production domains
        process.env.PRODUCTION_WEB_URL,
        process.env.RENDER_EXTERNAL_URL,
        // Explicit Render domains
        "https://poolcare-web.onrender.com",
        "https://poolcare.onrender.com",
        // Custom domains
        "https://admin.poolcare.africa",
        "https://poolcare.africa",
        "https://www.poolcare.africa",
        ].filter(Boolean);
        
        // Allow localhost, network IPs for development, Render domains, and custom domains
        if (
          origin.includes("localhost") ||
          origin.startsWith("http://127.0.0.1:") ||
          origin.match(/^http:\/\/192\.168\.\d+\.\d+/) ||
          origin.match(/^http:\/\/172\.\d+\.\d+\.\d+/) ||
          origin.match(/^http:\/\/10\.\d+\.\d+\.\d+/) ||
          origin.includes(".onrender.com") ||  // Allow all Render subdomains
          origin.includes("poolcare.africa") ||  // Allow all poolcare.africa subdomains
          allowedOrigins.includes(origin)
        ) {
          return callback(null, true);
        }
        
        callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    });

    const port = process.env.PORT || 4000;
    // Listen on all network interfaces (0.0.0.0) to allow mobile app connections
    await app.listen(port, '0.0.0.0');
    const ifaces = os.networkInterfaces();
    const lanIps: string[] = [];
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) lanIps.push(iface.address);
      }
    }
    console.log(`✅ API running on http://localhost:${port}/api`);
    console.log(`✅ API accessible from network on port ${port}`);
    if (lanIps.length) {
      console.log(`💡 For mobile: set EXPO_PUBLIC_API_URL=http://${lanIps[0]}:${port}/api in apps/client/.env`);
      console.log(`💡 Or set EXPO_PUBLIC_NETWORK_IP=${lanIps[0]} in apps/client/.env`);
    }
  } catch (error) {
    console.error('❌ Failed to start API server:', error);
    process.exit(1);
  }
}

bootstrap();

