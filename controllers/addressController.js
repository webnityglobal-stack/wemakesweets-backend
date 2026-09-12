const mongoose = require("mongoose");
const Address = require("../models/address");

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

    const {
      name,
      phone,
      email,
      address,
      address2,
      city,
      state,
      pincode,
      country,
      isDefault,
    } = req.body;

    if (
      !name ||
      !phone ||
      !address ||
      !city ||
      !state ||
      !pincode
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Name, phone, address, city, state and pincode are required",
      });
    }

    // Check existing addresses
    const existingCount = await Address.countDocuments({
      user: userId,
    });

    // First address automatically becomes default
    const shouldBeDefault =
      existingCount === 0 || isDefault === true;

    // If this address is default,
    // remove default from previous addresses
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

    const newAddress = await Address.create({
      user: userId,
      name,
      phone,
      email: email || "",
      address,
      address2: address2 || "",
      city,
      state,
      pincode,
      country: country || "India",
      isDefault: shouldBeDefault,
    });

    return res.status(201).json({
      success: true,
      message: "Address added successfully",
      address: newAddress,
    });
  } catch (error) {
    console.error("Add Address Error:", error);

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

    const {
      name,
      phone,
      email,
      address: addressLine,
      address2,
      city,
      state,
      pincode,
      country,
      isDefault,
    } = req.body;

    if (name !== undefined) address.name = name;
    if (phone !== undefined) address.phone = phone;
    if (email !== undefined) address.email = email;
    if (addressLine !== undefined)
      address.address = addressLine;
    if (address2 !== undefined)
      address.address2 = address2;
    if (city !== undefined) address.city = city;
    if (state !== undefined) address.state = state;
    if (pincode !== undefined) address.pincode = pincode;
    if (country !== undefined) address.country = country;

    if (isDefault === true) {
      await Address.updateMany(
        {
          user: userId,
          _id: { $ne: id },
        },
        {
          $set: {
            isDefault: false,
          },
        }
      );

      address.isDefault = true;
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