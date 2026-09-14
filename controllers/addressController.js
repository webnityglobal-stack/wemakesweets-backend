const mongoose = require("mongoose");
const Address = require("../models/address");
const User = require("../models/user");

// ==========================================
// GET MY ADDRESSES
// ==========================================

const getMyAddresses = async (req, res) => {
  try {
    const userId = req.userId;

    const addresses = await Address.find({
      user: userId,
    }).sort({
      isDefault: -1,
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      count: addresses.length,
      addresses,
    });
  } catch (error) {
    console.error("Get Addresses Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch addresses",
    });
  }
};

// ==========================================
// ADD ADDRESS
// ==========================================

const addAddress = async (req, res) => {
  try {
    const userId = req.userId;

    // Get logged-in user's profile
    const user = await User.findById(userId).select(
      "name email phone"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const {
      address,
      address2,
      city,
      state,
      pincode,
      country,
      isDefault,
    } = req.body;

    // Required address fields
    if (
      !address ||
      !city ||
      !state ||
      !pincode
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Address, city, state and pincode are required",
      });
    }

    // Count existing addresses
    const existingCount =
      await Address.countDocuments({
        user: userId,
      });

    // First address automatically default
    const shouldBeDefault =
      existingCount === 0 ||
      isDefault === true;

    // If new address is default,
    // remove default from old addresses
    if (shouldBeDefault) {
      await Address.updateMany(
        {
          user: userId,
        },
        {
          $set: {
            isDefault: false,
          },
        }
      );
    }

    // Create address
    const newAddress = await Address.create({
      user: userId,

      // Automatically taken from User
      name: user.name,
      phone: user.phone,
      email: user.email,

      // Address details
      address: address.trim(),
      address2: address2
        ? address2.trim()
        : "",
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      country: country
        ? country.trim()
        : "India",

      isDefault: shouldBeDefault,
    });

    return res.status(201).json({
      success: true,
      message: "Address added successfully",
      address: newAddress,
    });
  } catch (error) {
    console.error(
      "Add Address Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to add address",
    });
  }
};

// ==========================================
// UPDATE ADDRESS
// ==========================================

const updateAddress = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid address ID",
      });
    }

    const address = await Address.findOne({
      _id: id,
      user: userId,
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    // Only address-related fields can be updated
    const {
      address: addressLine,
      address2,
      city,
      state,
      pincode,
      country,
    } = req.body;

    if (
      addressLine === undefined &&
      address2 === undefined &&
      city === undefined &&
      state === undefined &&
      pincode === undefined &&
      country === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "No address fields provided for update",
      });
    }

    if (addressLine !== undefined) {
      address.address = addressLine.trim();
    }

    if (address2 !== undefined) {
      address.address2 = address2.trim();
    }

    if (city !== undefined) {
      address.city = city.trim();
    }

    if (state !== undefined) {
      address.state = state.trim();
    }

    if (pincode !== undefined) {
      address.pincode = pincode.trim();
    }

    if (country !== undefined) {
      address.country = country.trim();
    }

    await address.save();

    return res.status(200).json({
      success: true,
      message: "Address updated successfully",
      address,
    });
  } catch (error) {
    console.error("Update Address Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update address",
    });
  }
};

// ==========================================
// DELETE ADDRESS
// ==========================================

const deleteAddress = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid address ID",
      });
    }

    const address = await Address.findOne({
      _id: id,
      user: userId,
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    const wasDefault = address.isDefault;

    await Address.deleteOne({
      _id: id,
      user: userId,
    });

    // If deleted address was default,
    // make another address default
    if (wasDefault) {
      const nextAddress = await Address.findOne({
        user: userId,
      }).sort({
        createdAt: -1,
      });

      if (nextAddress) {
        nextAddress.isDefault = true;
        await nextAddress.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: "Address deleted successfully",
    });
  } catch (error) {
    console.error("Delete Address Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete address",
    });
  }
};

// ==========================================
// SET DEFAULT ADDRESS
// ==========================================

const setDefaultAddress = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid address ID",
      });
    }

    const address = await Address.findOne({
      _id: id,
      user: userId,
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    await Address.updateMany(
      {
        user: userId,
      },
      {
        $set: {
          isDefault: false,
        },
      }
    );

    address.isDefault = true;

    await address.save();

    return res.status(200).json({
      success: true,
      message: "Default address updated successfully",
      address,
    });
  } catch (error) {
    console.error("Set Default Address Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to set default address",
    });
  }
};

module.exports = {
  getMyAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
};