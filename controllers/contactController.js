const Contact = require("../models/contact");
const sendEmail = require("../utils/sendEmail");

// ==========================================
// SUBMIT CONTACT FORM (PUBLIC)
// ==========================================
const submitContact = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Full Name is required.",
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email Address is required.",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required.",
      });
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone ? phone.trim() : "";
    const trimmedSubject = subject ? subject.trim() : "";
    const trimmedMessage = message.trim();

    // 1. Save submission to MongoDB
    let savedContact = null;
    try {
      savedContact = await Contact.create({
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        subject: trimmedSubject,
        message: trimmedMessage,
      });
    } catch (dbErr) {
      console.error("Database save error for contact:", dbErr.message);
    }

    // 2. Target recipient email: ajaysa9760@gmail.com
    const recipientEmail = (
      process.env.CONTACT_RECEIVER_EMAIL || "ajaysa9760@gmail.com"
    ).trim();

    const emailSubject = trimmedSubject
      ? `New Contact Inquiry: ${trimmedSubject} - ${trimmedName}`
      : `New Contact Inquiry from ${trimmedName}`;

    const textContent = `
You have received a new contact message from the website contact form.

Name: ${trimmedName}
Email: ${trimmedEmail}
Phone: ${trimmedPhone || "Not provided"}
Subject: ${trimmedSubject || "Not provided"}

Message:
${trimmedMessage}

Submitted: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
    `.trim();

    const sanitizedMessage = trimmedMessage
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e0d5c1; border-radius: 12px; overflow: hidden; background-color: #fdfaf3;">
        <div style="background-color: #603917; padding: 24px 20px; text-align: center; color: #f9e4bf;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 1px;">We Make Sweets</h1>
          <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.9;">New Contact Form Submission</p>
        </div>
        
        <div style="padding: 24px; color: #333333; line-height: 1.6;">
          <h2 style="font-size: 18px; color: #810c26; margin-top: 0; border-bottom: 2px solid #f0e6d2; padding-bottom: 8px;">
            Inquiry Details
          </h2>
          
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 10px 0; font-weight: bold; width: 140px; color: #603917;">Full Name:</td>
              <td style="padding: 10px 0; color: #222;">${trimmedName}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; font-weight: bold; color: #603917;">Email Address:</td>
              <td style="padding: 10px 0; color: #222;">
                <a href="mailto:${trimmedEmail}" style="color: #810c26; text-decoration: none; font-weight: bold;">
                  ${trimmedEmail}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0; font-weight: bold; color: #603917;">Phone Number:</td>
              <td style="padding: 10px 0; color: #222;">${trimmedPhone || "<em>Not provided</em>"}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; font-weight: bold; color: #603917;">Subject:</td>
              <td style="padding: 10px 0; color: #222;">${trimmedSubject || "<em>Not provided</em>"}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; font-weight: bold; color: #603917;">Received At:</td>
              <td style="padding: 10px 0; color: #666; font-size: 13px;">${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
            </tr>
          </table>

          <div style="background-color: #ffffff; border-left: 4px solid #810c26; border-radius: 6px; padding: 16px; margin-top: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #603917;">Message:</p>
            <p style="margin: 0; white-space: pre-wrap; color: #444; font-size: 14px;">${sanitizedMessage}</p>
          </div>
        </div>

        <div style="background-color: #f5ebda; padding: 16px; text-align: center; font-size: 12px; color: #777; border-top: 1px solid #e5d8c3;">
          <p style="margin: 0;">This email was automatically generated from the contact form on <strong>wemakesweets.com</strong>.</p>
          <p style="margin: 4px 0 0 0;">You can click Reply in your email client to reply directly to <strong>${trimmedName}</strong> (${trimmedEmail}).</p>
        </div>
      </div>
    `;

    // 3. Send email via nodemailer
    await sendEmail({
      to: recipientEmail,
      replyTo: trimmedEmail,
      subject: emailSubject,
      text: textContent,
      html: htmlContent,
    });

    return res.status(200).json({
      success: true,
      message: "Thank you! Your message has been sent successfully.",
      data: savedContact,
    });
  } catch (error) {
    console.error("Contact submission error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send message. Please try again later.",
      error: error.message,
    });
  }
};

// ==========================================
// GET ALL CONTACT MESSAGES (ADMIN)
// ==========================================
const getAllContacts = async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: contacts.length,
      data: contacts,
    });
  } catch (error) {
    console.error("Get contacts error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ==========================================
// SUBMIT FAQ QUESTION (PUBLIC)
// ==========================================
const submitFAQQuestion = async (req, res) => {
  try {
    const { question, name, email, phone } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: "Question is required.",
      });
    }

    const trimmedQuestion = question.trim();
    const senderName = name && name.trim() ? name.trim() : "Website Visitor";
    const senderEmail = email && email.trim() ? email.trim().toLowerCase() : "";
    const senderPhone = phone && phone.trim() ? phone.trim() : "";

    // 1. Save to MongoDB
    let savedContact = null;
    try {
      savedContact = await Contact.create({
        name: senderName,
        email: senderEmail || "visitor@wemakesweets.com",
        phone: senderPhone,
        subject: "FAQ - Still Have a Question",
        message: trimmedQuestion,
      });
    } catch (dbErr) {
      console.error("Database save error for FAQ question:", dbErr.message);
    }

    // 2. Email to ajaysa9760@gmail.com
    const recipientEmail = (
      process.env.CONTACT_RECEIVER_EMAIL || "ajaysa9760@gmail.com"
    ).trim();

    const emailSubject = `[FAQ Question] ${senderName}: ${trimmedQuestion.slice(0, 50)}${trimmedQuestion.length > 50 ? "..." : ""}`;

    const textContent = `
You have received a new question from the "Still have a question?" section on We Make Sweets.

Question:
${trimmedQuestion}

Submitted by:
Name: ${senderName}
Email: ${senderEmail || "Not provided (Guest)"}
Phone: ${senderPhone || "Not provided"}

Received At: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
    `.trim();

    const sanitizedQuestion = trimmedQuestion
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e0d5c1; border-radius: 12px; overflow: hidden; background-color: #fdfaf3;">
        <div style="background-color: #603917; padding: 24px 20px; text-align: center; color: #f9e4bf;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 1px;">We Make Sweets</h1>
          <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.9;">New Question from FAQ Page</p>
        </div>
        
        <div style="padding: 24px; color: #333333; line-height: 1.6;">
          <div style="background-color: #ffffff; border-left: 4px solid #8b183d; border-radius: 6px; padding: 18px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #810c26; font-size: 15px;">Question Asked:</p>
            <p style="margin: 0; white-space: pre-wrap; color: #222; font-size: 15px; font-weight: 500;">${sanitizedQuestion}</p>
          </div>

          <h3 style="font-size: 16px; color: #603917; margin: 20px 0 10px 0; border-bottom: 1px solid #f0e6d2; padding-bottom: 6px;">
            User Information
          </h3>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; width: 140px; color: #603917;">Name:</td>
              <td style="padding: 8px 0; color: #222;">${senderName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #603917;">Email:</td>
              <td style="padding: 8px 0; color: #222;">
                ${
                  senderEmail
                    ? `<a href="mailto:${senderEmail}" style="color: #810c26; text-decoration: none; font-weight: bold;">${senderEmail}</a>`
                    : "<em>Not provided (Guest visitor)</em>"
                }
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #603917;">Phone:</td>
              <td style="padding: 8px 0; color: #222;">${senderPhone || "<em>Not provided</em>"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #603917;">Received At:</td>
              <td style="padding: 8px 0; color: #666; font-size: 13px;">${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
            </tr>
          </table>
        </div>

        <div style="background-color: #f5ebda; padding: 16px; text-align: center; font-size: 12px; color: #777; border-top: 1px solid #e5d8c3;">
          <p style="margin: 0;">This email was automatically generated from the 'Still have a question?' section on <strong>wemakesweets.com</strong>.</p>
          ${
            senderEmail
              ? `<p style="margin: 4px 0 0 0;">Reply directly to this email to contact <strong>${senderName}</strong> (${senderEmail}).</p>`
              : ""
          }
        </div>
      </div>
    `;

    // 3. Send email via nodemailer
    const emailOptions = {
      to: recipientEmail,
      subject: emailSubject,
      text: textContent,
      html: htmlContent,
    };

    if (senderEmail) {
      emailOptions.replyTo = senderEmail;
    }

    await sendEmail(emailOptions);

    return res.status(200).json({
      success: true,
      message: "Thank you! Your question has been submitted successfully.",
      data: savedContact,
    });
  } catch (error) {
    console.error("FAQ question submission error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit question. Please try again later.",
      error: error.message,
    });
  }
};

module.exports = {
  submitContact,
  submitFAQQuestion,
  getAllContacts,
};
