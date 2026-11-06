import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const emailFrom = process.env.EMAIL_FROM || 'Disc Market <onboarding@resend.dev>';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Plantilla HTML base con la identidad visual oscura de Disc Market
 */
const getBaseHtmlTemplate = (title: string, bodyContent: string): string => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #12110f; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #f3eee4;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #12110f; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background-color: #1b1915; border: 1px solid #3c362e; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td align="center" style="padding: 32px 30px 20px 30px; border-bottom: 1px solid #2e2a24;">
              <span style="font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: #f3eee4;">
                Disc<span style="color: #e8a23a;">Market</span>
              </span>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #b7afa3; letter-spacing: 1px; text-transform: uppercase;">
                Atelier de Vinilos & CDs
              </p>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 30px;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 20px 30px 30px 30px; border-top: 1px solid #2e2a24; font-size: 11px; color: #7a7368;">
              <p style="margin: 0 0 6px 0;">Este es un correo automático de seguridad de Disc Market.</p>
              <p style="margin: 0;">Si no solicitaste esta acción, puedes ignorar este mensaje; tu cuenta permanece segura.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

export const mailService = {
  /**
   * Envía un correo con el enlace para restablecer contraseña
   */
  sendPasswordResetEmail: async (
    to: string,
    resetToken: string,
    userName?: string
  ): Promise<boolean> => {
    const resetUrl = `${frontendUrl}/recuperar-contrasena?token=${resetToken}`;
    const displayName = userName ? `Hola, ${userName}` : 'Hola';

    const bodyContent = `
      <h2 style="margin: 0 0 16px 0; font-size: 20px; color: #f3eee4; font-weight: 600;">
        Recuperación de contraseña
      </h2>
      <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #b7afa3;">
        ${displayName}. Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>Disc Market</strong>.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" style="background-color: #e8a23a; color: #12110f; text-decoration: none; padding: 14px 32px; border-radius: 50px; font-weight: 700; font-size: 14px; display: inline-block;">
          Restablecer mi contraseña
        </a>
      </div>
      <p style="margin: 0 0 12px 0; font-size: 12px; line-height: 1.5; color: #8f877b;">
        Este enlace expirará en <strong>30 minutos</strong> y solo puede usarse una vez.
      </p>
      <p style="margin: 0; font-size: 11px; line-height: 1.5; color: #6b645b; word-break: break-all;">
        Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
        <a href="${resetUrl}" style="color: #e8a23a; text-decoration: underline;">${resetUrl}</a>
      </p>
    `;

    const html = getBaseHtmlTemplate('Restablece tu contraseña - Disc Market', bodyContent);

    if (!resend) {
      console.log('\n======================================================');
      console.log('📨 [DEV MAIL SIMULATOR] RECUPERACIÓN DE CONTRASEÑA');
      console.log(`Para: ${to}`);
      console.log(`Enlace de recuperación: ${resetUrl}`);
      console.log('======================================================\n');
      return true;
    }

    try {
      await resend.emails.send({
        from: emailFrom,
        to,
        subject: '🔐 Restablece tu contraseña - Disc Market',
        html,
      });
      return true;
    } catch (error: any) {
      console.error('Error al enviar correo vía Resend:', error);
      // Fallback a consola en caso de error de proveedor en pruebas
      console.log(`[FALLBACK DEV LINK]: ${resetUrl}`);
      return false;
    }
  },

  /**
   * Envía un código OTP de 6 dígitos para inicio de sesión sin contraseña
   */
  sendOtpEmail: async (
    to: string,
    code: string,
    userName?: string
  ): Promise<boolean> => {
    const displayName = userName ? `Hola, ${userName}` : 'Hola';

    const bodyContent = `
      <h2 style="margin: 0 0 16px 0; font-size: 20px; color: #f3eee4; font-weight: 600;">
        Código de acceso temporal
      </h2>
      <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #b7afa3;">
        ${displayName}. Ingresa el siguiente código de 6 dígitos en Disc Market para iniciar sesión en tu cuenta:
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <div style="display: inline-block; background-color: #12110f; border: 2px dashed #e8a23a; border-radius: 16px; padding: 16px 36px;">
          <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #e8a23a; font-family: monospace;">
            ${code}
          </span>
        </div>
      </div>
      <p style="margin: 0 0 8px 0; font-size: 13px; text-align: center; color: #8f877b;">
        ⏱️ Válido durante los próximos <strong>10 minutos</strong>.
      </p>
      <p style="margin: 0; font-size: 11px; text-align: center; color: #6b645b;">
        Por seguridad, no compartas este código con nadie.
      </p>
    `;

    const html = getBaseHtmlTemplate('Tu código de acceso - Disc Market', bodyContent);

    if (!resend) {
      console.log('\n======================================================');
      console.log('📨 [DEV MAIL SIMULATOR] CÓDIGO OTP DE ACCESO');
      console.log(`Para: ${to}`);
      console.log(`Código OTP: ${code}`);
      console.log('======================================================\n');
      return true;
    }

    try {
      await resend.emails.send({
        from: emailFrom,
        to,
        subject: `🔑 Tu código de acceso es ${code} - Disc Market`,
        html,
      });
      return true;
    } catch (error: any) {
      console.error('Error al enviar correo vía Resend:', error);
      console.log(`[FALLBACK DEV OTP CODE]: ${code}`);
      return false;
    }
  },
};
