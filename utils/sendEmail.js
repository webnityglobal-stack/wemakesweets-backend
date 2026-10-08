const nodemailer = require("nodemailer");

const sendEmail = async (toOrOptions, subject, text, html = null, replyTo = null) => {
  try {
    const emailUser = (process.env.EMAIL_USER || "").trim();
    const emailPassword = (process.env.EMAIL_PASSWORD || "").trim();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: emailUser,
        pass: emailPassword,
      },
    });

    let mailOptions;
    if (typeof toOrOptions === "object" && toOrOptions !== null) {
      mailOptions = {
        from: toOrOptions.from || `"We Make Sweets" <${emailUser}>`,
        ...toOrOptions,
      };
    } else {
      mailOptions = {
        from: `"We Make Sweets" <${emailUser}>`,
        to: toOrOptions,
        subject,
        text,
      };
      if (html) {
        mailOptions.html = html;
      }
      if (replyTo) {
        mailOptions.replyTo = replyTo;
      }
    }

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.messageId);
    return info;
  } catch (error) {
    console.error("Email sending failed:", error);
    throw error;
  }
};

module.exports = sendEmail;