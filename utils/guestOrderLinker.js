const User = require("../models/user");
const Order = require("../models/order");
const Payment = require("../models/payment");
const Address = require("../models/address");
const Cart = require("../models/cart");
const {
  extractPhone10,
  getPhoneVariants,
  isPlaceholderPhone,
} = require("../services/msg91Service");

/**
 * Find an existing user by phone across all stored Indian phone formats
 * (e.g. 9876543210, +919876543210, 919876543210, 09876543210).
 */
const findUserByPhone = async (rawPhone) => {
  const phone10 = extractPhone10(rawPhone);
  if (!phone10) return null;

  const variants = getPhoneVariants(phone10);
  const trailingRegex = new RegExp(`${phone10}$`);

  return await User.findOne({
    $or: [{ phone: { $in: variants } }, { phone: trailingRegex }],
  });
};

/**
 * Find unlinked guest orders matching a customer's mobile number (and optional guestId).
 * Never links placeholder phone numbers like "9999999999".
 */
const findGuestOrdersForPhone = async (rawPhone, guestId = null) => {
  const phone10 = extractPhone10(rawPhone);
  const validPhone = phone10 && !isPlaceholderPhone(phone10);
  const cleanedGuestId =
    guestId &&
    !["null", "undefined"].includes(String(guestId).trim().toLowerCase())
      ? String(guestId).trim()
      : null;

  if (!validPhone && !cleanedGuestId) {
    return [];
  }

  const unlinkedCondition = {
    $or: [{ user: null }, { user: { $exists: false } }],
  };

  const matchClauses = [];
  let variants = [];
  let trailingRegex = null;

  if (validPhone) {
    variants = getPhoneVariants(phone10);
    trailingRegex = new RegExp(`${phone10}$`);
    matchClauses.push(
      { "shippingAddress.phone": { $in: variants } },
      { "shippingAddress.phone": trailingRegex }
    );
  }

  if (cleanedGuestId) {
    // Only match by guestId if the order doesn't belong to a DIFFERENT real phone number
    const guestIdClause = {
      guestId: cleanedGuestId,
      $or: [
        { shippingAddress: null },
        { "shippingAddress.phone": { $exists: false } },
        { "shippingAddress.phone": { $in: [null, "", "9999999999", "0000000000"] } },
        ...(validPhone
          ? [
              { "shippingAddress.phone": { $in: variants } },
              { "shippingAddress.phone": trailingRegex },
            ]
          : []),
      ],
    };
    matchClauses.push(guestIdClause);
  }

  // Fallback: check unlinked Payments whose FastRR gatewayResponse contains this phone
  if (validPhone) {
    try {
      const matchingPayments = await Payment.find({
        $and: [
          unlinkedCondition,
          {
            $or: [
              { "gatewayResponse.phone": { $in: variants } },
              { "gatewayResponse.phone": trailingRegex },
              { "gatewayResponse.customer_details.phone": { $in: variants } },
              { "gatewayResponse.customer_details.phone": trailingRegex },
              { "gatewayResponse.shipping_address.phone": { $in: variants } },
              { "gatewayResponse.shipping_address.phone": trailingRegex },
              { "gatewayResponse.result.shipping_address.phone": { $in: variants } },
              { "gatewayResponse.result.shipping_address.phone": trailingRegex },
              { "gatewayResponse.result.customer_details.phone": { $in: variants } },
              { "gatewayResponse.result.customer_details.phone": trailingRegex },
            ],
          },
        ],
      })
        .select("order")
        .lean();

      const paymentOrderIds = matchingPayments
        .map((p) => p.order)
        .filter(Boolean);

      if (paymentOrderIds.length > 0) {
        matchClauses.push({ _id: { $in: paymentOrderIds } });
      }
    } catch (payLookupErr) {
      console.warn(
        "[GuestLinker] Payment gatewayResponse fallback lookup skipped:",
        payLookupErr.message
      );
    }
  }

  if (matchClauses.length === 0) {
    return [];
  }

  return await Order.find({
    $and: [unlinkedCondition, { $or: matchClauses }],
  }).sort({ createdAt: -1 });
};

/**
 * Merge a guest Cart into the authenticated user's Cart.
 */
const mergeGuestCartIntoUserCart = async (userId, guestId) => {
  const cleanedGuestId =
    guestId &&
    !["null", "undefined"].includes(String(guestId).trim().toLowerCase())
      ? String(guestId).trim()
      : null;

  if (!userId || !cleanedGuestId) return false;

  try {
    const guestCart = await Cart.findOne({ guestId: cleanedGuestId });
    if (!guestCart || !guestCart.items || guestCart.items.length === 0) {
      return false;
    }

    let userCart = await Cart.findOne({ user: userId });
    if (!userCart) {
      userCart = new Cart({
        user: userId,
        items: [],
        totalAmount: 0,
      });
    }

    for (const gItem of guestCart.items) {
      const gProdId = gItem.product.toString();
      const gVarId = gItem.variantId ? gItem.variantId.toString() : null;

      const existingItem = userCart.items.find((uItem) => {
        const uProdId = uItem.product.toString();
        const uVarId = uItem.variantId ? uItem.variantId.toString() : null;
        return uProdId === gProdId && uVarId === gVarId;
      });

      if (existingItem) {
        existingItem.quantity =
          Number(existingItem.quantity) + Number(gItem.quantity);
        existingItem.price = gItem.price;
      } else {
        userCart.items.push({
          product: gItem.product,
          variantId: gItem.variantId,
          quantity: gItem.quantity,
          price: gItem.price,
        });
      }
    }

    userCart.totalAmount = userCart.items.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );

    await userCart.save();
    await Cart.deleteOne({ _id: guestCart._id });
    return true;
  } catch (err) {
    console.warn("[GuestLinker] Could not merge guest cart:", err.message);
    return false;
  }
};

/**
 * Link all unlinked guest orders, payments, saved addresses, and optional guest cart
 * to an authenticated User document.
 */
const linkGuestDataToUser = async (
  user,
  guestId = null,
  options = { mergeCart: true }
) => {
  if (!user || !user._id) {
    return { linkedOrderCount: 0, linkedOrderIds: [], mergedCart: false };
  }

  let linkedOrderIds = [];
  let mergedCart = false;

  try {
    const guestOrders = await findGuestOrdersForPhone(user.phone, guestId);

    if (guestOrders.length > 0) {
      linkedOrderIds = guestOrders.map((o) => o._id);

      await Order.updateMany(
        {
          _id: { $in: linkedOrderIds },
          $or: [{ user: null }, { user: { $exists: false } }],
        },
        {
          $set: {
            user: user._id,
            isGuest: false,
          },
        }
      );

      await Payment.updateMany(
        {
          order: { $in: linkedOrderIds },
          $or: [{ user: null }, { user: { $exists: false } }],
        },
        {
          $set: {
            user: user._id,
            isGuest: false,
          },
        }
      );

      // Backfill customer name on User if still default "Customer"
      const bestOrderWithName = guestOrders.find(
        (o) =>
          o.shippingAddress?.name &&
          String(o.shippingAddress.name).trim() &&
          String(o.shippingAddress.name).trim().toLowerCase() !== "customer"
      );

      if (
        bestOrderWithName &&
        (!user.name || String(user.name).trim().toLowerCase() === "customer")
      ) {
        const resolvedName = String(bestOrderWithName.shippingAddress.name).trim();
        await User.updateOne({ _id: user._id }, { $set: { name: resolvedName } });
        user.name = resolvedName;
      }

      // Auto-seed latest valid shipping address into Address collection
      const bestOrderWithAddress = guestOrders.find(
        (o) =>
          o.shippingAddress?.address &&
          o.shippingAddress.address !== "Customer Address"
      );

      if (bestOrderWithAddress?.shippingAddress) {
        const sa = bestOrderWithAddress.shippingAddress;
        try {
          const existingAddrCount = await Address.countDocuments({
            user: user._id,
          });
          await Address.findOneAndUpdate(
            {
              user: user._id,
              pincode: sa.pincode,
              address: sa.address,
            },
            {
              $setOnInsert: {
                user: user._id,
                name: sa.name || user.name || "Customer",
                phone: sa.phone || user.phone,
                email: sa.email || user.email || "",
                address: sa.address,
                address2: sa.address2 || "",
                city: sa.city || "Meerut",
                state: sa.state || "Uttar Pradesh",
                pincode: sa.pincode || "250002",
                country: sa.country || "India",
                isDefault: existingAddrCount === 0,
              },
            },
            { upsert: true }
          );
        } catch (addrErr) {
          console.warn(
            "[GuestLinker] Could not auto-seed address:",
            addrErr.message
          );
        }
      }

      console.log(
        `[GuestLinker] Linked ${linkedOrderIds.length} guest order(s) to user ${user._id} (${user.phone})`
      );
    }

    if (options.mergeCart !== false && guestId) {
      mergedCart = await mergeGuestCartIntoUserCart(user._id, guestId);
    }
  } catch (error) {
    console.error("[GuestLinker] Error linking guest data:", error.message);
  }

  return {
    linkedOrderCount: linkedOrderIds.length,
    linkedOrderIds,
    mergedCart,
  };
};

/**
 * When a guest order receives a valid shippingAddress.phone (at checkout, address update, or FastRR webhook),
 * check if a User account already exists with that phone and link the order immediately.
 */
const autoLinkSingleOrderIfUserExists = async (order) => {
  try {
    if (!order || order.user) return false;

    const phone10 = extractPhone10(order.shippingAddress?.phone);
    if (!phone10 || isPlaceholderPhone(phone10)) return false;

    const existingUser = await findUserByPhone(phone10);
    if (!existingUser) return false;

    order.user = existingUser._id;
    order.isGuest = false;
    await order.save();

    await Payment.updateMany(
      {
        order: order._id,
        $or: [{ user: null }, { user: { $exists: false } }],
      },
      {
        $set: {
          user: existingUser._id,
          isGuest: false,
        },
      }
    );

    console.log(
      `[GuestLinker] Auto-linked order ${order.orderId} to existing user ${existingUser._id} (${existingUser.phone})`
    );
    return true;
  } catch (err) {
    console.warn(
      `[GuestLinker] Could not auto-link order ${order?.orderId}:`,
      err.message
    );
    return false;
  }
};

module.exports = {
  findUserByPhone,
  findGuestOrdersForPhone,
  mergeGuestCartIntoUserCart,
  linkGuestDataToUser,
  autoLinkSingleOrderIfUserExists,
};
