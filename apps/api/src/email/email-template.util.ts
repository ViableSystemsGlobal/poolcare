/**
 * Email template utility for creating branded email HTML
 * Styled like Paystack with logo at the top
 */

import { prisma } from "@poolcare/db";

export interface EmailTemplateOptions {
  logoUrl?: string;
  organizationName?: string;
  primaryColor?: string;
  footerText?: string;
}

/**
 * Ensure logo URL is email-safe (absolute, publicly accessible)
 * Uses the stored logo URL directly - same as sidebar uses
 */
async function ensureEmailSafeLogoUrl(logoUrl: string | null | undefined, orgId: string): Promise<string | null> {
  if (!logoUrl) {
    console.log(`[Email Logo] No logo URL in database for org ${orgId}`);
    return null;
  }

  console.log(`[Email Logo] Using logo URL from database for org ${orgId}: ${logoUrl.substring(0, 100)}...`);
  
  // Use the logo URL exactly as stored - same as sidebar uses
  // The sidebar successfully displays it, so email should too
  // If it's a presigned URL, it should work in emails too
  // If it's localhost, email clients won't be able to access it, but that's a deployment issue
  
  // Just ensure it's an absolute URL
  if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
    return logoUrl;
  }
  
  // Make relative URLs absolute
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  return `${apiUrl}${logoUrl.startsWith("/") ? "" : "/"}${logoUrl}`;
}

/**
 * Get organization settings for email templates
 */
export async function getOrgEmailSettings(orgId: string): Promise<EmailTemplateOptions> {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      return {
        organizationName: "PoolCare",
        primaryColor: "#0d9488",
      };
    }

    const orgSetting = await prisma.orgSetting.findUnique({
      where: { orgId },
    });

    const profile = (orgSetting?.profile as any) || {};
    
    // Get logo URL - use exactly what's stored, same as sidebar
    const rawLogoUrl = profile.logoUrl || null;
    console.log(`[Email Settings] Raw logo URL from DB for org ${orgId}: ${rawLogoUrl ? rawLogoUrl.substring(0, 100) + '...' : 'null'}`);
    
    const logoUrl = await ensureEmailSafeLogoUrl(rawLogoUrl, orgId);
    console.log(`[Email Settings] Final logo URL for org ${orgId}: ${logoUrl ? logoUrl.substring(0, 100) + '...' : 'null'}`);

    return {
      logoUrl,
      organizationName: org.name || "PoolCare",
      primaryColor: profile.themeColor ? getThemeColorHex(profile.themeColor) : "#0d9488",
      footerText: `© ${org.name || "PoolCare"}. All rights reserved.`,
    };
  } catch (error) {
    console.error("Failed to get org email settings:", error);
    return {
      organizationName: "PoolCare",
      primaryColor: "#0d9488",
    };
  }
}

/**
 * Convert theme color name to hex
 */
function getThemeColorHex(themeColor: string): string {
  const colorMap: { [key: string]: string } = {
    purple: "#9333ea",
    blue: "#2563eb",
    green: "#16a34a",
    orange: "#ea580c",
    red: "#dc2626",
    indigo: "#4f46e5",
    pink: "#db2777",
    teal: "#0d9488",
  };
  return colorMap[themeColor] || "#0d9488";
}

export function createEmailTemplate(
  content: string,
  options: EmailTemplateOptions = {}
): string {
  const {
    logoUrl,
    organizationName = "PoolCare",
    primaryColor = "#0d9488", // Default teal
    footerText = "© PoolCare. All rights reserved.",
  } = options;

  // Log for debugging
  if (logoUrl) {
    console.log(`[Email Template] Using logo URL: ${logoUrl.substring(0, 100)}...`);
  } else {
    console.log(`[Email Template] No logo URL, using text fallback for: ${organizationName}`);
  }

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${organizationName}" style="max-width: 200px; height: auto; margin-bottom: 24px; display: block; margin-left: auto; margin-right: auto;" />`
    : `<div style="font-size: 24px; font-weight: bold; color: ${primaryColor}; margin-bottom: 24px; text-align: center;">${organizationName}</div>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${organizationName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-collapse: collapse;">
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 40px 40px 24px 40px; text-align: center; border-bottom: 1px solid #e5e5e5;">
              ${logoHtml}
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px 40px;">
              <div style="color: #333333; font-size: 16px; line-height: 1.6;">
                ${content}
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9f9f9; border-top: 1px solid #e5e5e5; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #666666; font-size: 14px; text-align: center;">
                ${footerText}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Create a welcome email for new clients
 */
export function createWelcomeEmailTemplate(
  clientName: string,
  organizationName: string,
  options: EmailTemplateOptions = {}
): string {
  const content = `
    <h2 style="color: #333333; margin-top: 0; margin-bottom: 16px;">Welcome to ${organizationName}!</h2>
    <p style="margin: 0 0 16px 0;">Hi ${clientName},</p>
    <p style="margin: 0 0 16px 0;">
      We're excited to have you on board! Your account has been created and you can now access our mobile app to manage your pool services.
    </p>
    <p style="margin: 0 0 16px 0;">
      Download our mobile app to:
    </p>
    <ul style="margin: 0 0 16px 0; padding-left: 20px; color: #333333;">
      <li>View your pool information and service history</li>
      <li>Track upcoming visits and jobs</li>
      <li>View and pay invoices</li>
      <li>Request supplies and communicate with us</li>
    </ul>
    <p style="margin: 0;">
      If you have any questions, feel free to reach out to us anytime.
    </p>
    <p style="margin: 16px 0 0 0;">
      Best regards,<br>
      <strong>The ${organizationName} Team</strong>
    </p>
  `;

  return createEmailTemplate(content, {
    ...options,
    organizationName,
  });
}
