const User = require("../models/user");
const Product = require("../models/product");
const Order = require("../models/order");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");


// ========================================
// GET ADMIN DASHBOARD
// ========================================

const getAdminDashboard = async (req, res) => {
  try {
    // =================================================
    // DATE RANGE - LAST 7 DAYS
    // =================================================

    const now = new Date();

    const sevenDaysAgo = new Date(now);

    sevenDaysAgo.setDate(
      sevenDaysAgo.getDate() - 6
    );

    sevenDaysAgo.setHours(0, 0, 0, 0);


    // =================================================
    // ALL ORDERS
    // =================================================

    const orders = await Order.find()
      .populate(
        "user",
        "name email phone"
      )
      .populate(
        "items.product",
        "name price images sku"
      )
      .sort({
        createdAt: -1,
      });


    // =================================================
    // VALID ORDERS
    // CANCELLED ORDERS SALES ME INCLUDE NAHI HONGE
    // =================================================

    const validOrders = orders.filter(
      (order) =>
        String(
          order.orderStatus
        ).toUpperCase() !== "CANCELLED"
    );


    // =================================================
    // 1. GROSS SALES
    // =================================================

    const grossSales =
      validOrders.reduce(
        (total, order) =>
          total +
          Number(
            order.totalAmount || 0
          ),
        0
      );


    // =================================================
    // 2. TOTAL ORDERS
    // =================================================

    const totalOrders =
      orders.length;


    // =================================================
    // 3. ACTIVE PRODUCTS
    // =================================================

    const activeProducts =
      await Product.countDocuments();


    // =================================================
    // 4. AVERAGE ORDER VALUE
    // =================================================

    const averageOrderValue =
      validOrders.length > 0
        ? Math.round(
          grossSales /
          validOrders.length
        )
        : 0;


    // =================================================
    // 5. SALES TREND - LAST 7 DAYS
    // =================================================

    const salesAggregation =
      await Order.aggregate([
        {
          $match: {
            createdAt: {
              $gte: sevenDaysAgo,
              $lte: now,
            },

            $expr: {
              $ne: [
                {
                  $toUpper:
                    "$orderStatus",
                },
                "CANCELLED",
              ],
            },
          },
        },

        {
          $group: {
            _id: {
              $dateToString: {
                format:
                  "%Y-%m-%d",

                date: "$createdAt",

                timezone:
                  "Asia/Kolkata",
              },
            },

            revenue: {
              $sum:
                "$totalAmount",
            },

            orders: {
              $sum: 1,
            },
          },
        },

        {
          $sort: {
            _id: 1,
          },
        },
      ]);


    // =================================================
    // CREATE ALL 7 DAYS
    // =================================================

    const salesMap = {};

    salesAggregation.forEach(
      (item) => {
        salesMap[item._id] = {
          revenue:
            item.revenue,

          orders:
            item.orders,
        };
      }
    );


    const salesTrend = [];

    for (
      let i = 0;
      i < 7;
      i++
    ) {
      const date =
        new Date(
          sevenDaysAgo
        );

      date.setDate(
        sevenDaysAgo.getDate() +
        i
      );

      const dateString =
        date.toLocaleDateString(
          "en-CA",
          {
            timeZone:
              "Asia/Kolkata",
          }
        );

      salesTrend.push({
        date:
          dateString,

        revenue:
          salesMap[
            dateString
          ]?.revenue || 0,

        orders:
          salesMap[
            dateString
          ]?.orders || 0,
      });
    }


    // =================================================
    // 6. WEEKLY ORDERS
    // =================================================

    const weeklyOrders =
      salesTrend.reduce(
        (total, day) =>
          total + day.orders,
        0
      );


    // =================================================
    // 7. PEAK DAY
    // =================================================

    let peakDay = null;

    if (
      salesTrend.length > 0
    ) {
      const peak =
        salesTrend.reduce(
          (max, current) =>
            current.revenue >
              max.revenue
              ? current
              : max
        );

      peakDay = {
        date:
          peak.date,

        revenue:
          peak.revenue,

        orders:
          peak.orders,
      };
    }


    // =================================================
    // 8. PAYMENT SPLIT
    // =================================================

    const codOrders =
      validOrders.filter(
        (order) =>
          order.paymentMethod ===
          "COD"
      ).length;


    const prepaidOrders =
      validOrders.filter(
        (order) =>
          order.paymentMethod ===
          "ONLINE"
      ).length;


    const paymentOrders =
      codOrders +
      prepaidOrders;


    const codPercentage =
      paymentOrders > 0
        ? Math.round(
          (codOrders /
            paymentOrders) *
          100
        )
        : 0;


    const prepaidPercentage =
      paymentOrders > 0
        ? Math.round(
          (prepaidOrders /
            paymentOrders) *
          100
        )
        : 0;


    // =================================================
    // 9. ORDER STATUS BREAKDOWN
    // =================================================

    const statusBreakdown = {
      pending: 0,
      confirmed: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    };


    orders.forEach(
      (order) => {
        const status =
          order.orderStatus?.toLowerCase();

        if (
          Object.prototype.hasOwnProperty.call(
            statusBreakdown,
            status
          )
        ) {
          statusBreakdown[
            status
          ]++;
        }
      }
    );


    // =================================================
    // 10. TOP PRODUCTS
    // =================================================

    const topProducts =
      await Order.aggregate([
        {
          $match: {
            $expr: {
              $ne: [
                {
                  $toUpper:
                    "$orderStatus",
                },
                "CANCELLED",
              ],
            },
          },
        },

        {
          $unwind:
            "$items",
        },

        {
          $group: {
            _id:
              "$items.product",

            productName: {
              $first:
                "$items.name",
            },

            quantitySold: {
              $sum:
                "$items.quantity",
            },

            revenue: {
              $sum:
                "$items.total",
            },
          },
        },

        {
          $sort: {
            quantitySold: -1,
          },
        },

        {
          $limit: 5,
        },
      ]);


    // =================================================
    // 11. RECENT ORDERS
    // =================================================

    const recentOrders =
      orders
        .slice(0, 5)
        .map(
          (order) => ({
            _id:
              order._id,

            orderId:
              order.orderId,

            customer: {
              name:
                order.user?.name ||
                order.shippingAddress
                  ?.name ||
                "Unknown",

              email:
                order.user?.email ||
                order.shippingAddress
                  ?.email ||
                "",

              phone:
                order.user?.phone ||
                order.shippingAddress
                  ?.phone ||
                "",

              city:
                order.shippingAddress
                  ?.city ||
                "",
            },

            items:
              order.items,

            total:
              order.totalAmount,

            payment:
              order.paymentMethod,

            paymentStatus:
              order.paymentStatus,

            status:
              order.orderStatus,

            createdAt:
              order.createdAt,
          })
        );


    // =================================================
    // 12. RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      dashboard: {
        summary: {
          grossSales,
          totalOrders,
          activeProducts,
          averageOrderValue,
        },

        salesTrend,

        weeklyStats: {
          weeklyOrders,
          peakDay,
        },

        paymentSplit: {
          cod: codOrders,
          prepaid: prepaidOrders,
          total: paymentOrders,
          codPercentage,
          prepaidPercentage,
        },

        orderStatus:
          statusBreakdown,

        topProducts,

        recentOrders,
      },
    });

  } catch (error) {
    console.error(
      "Admin Dashboard Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to fetch admin dashboard",
    });
  }
};



// ========================================
// GET ALL ORDERS FOR ADMIN
// WITH PAGINATION + SEARCH + FILTER
// ========================================

const getAllOrders = async (
  req,
  res
) => {
  try {

    const {
      page = 1,
      limit = 20,
      status,
      paymentMethod,
      search,
    } = req.query;


    // =================================================
    // PAGINATION
    // =================================================

    const pageNumber = Math.max(
      parseInt(page) || 1,
      1
    );


    const limitNumber = Math.min(
      Math.max(
        parseInt(limit) || 20,
        1
      ),
      100
    );


    const skip =
      (pageNumber - 1) *
      limitNumber;


    // =================================================
    // FILTER
    // =================================================

    const filter = {};


    // =================================================
    // STATUS FILTER
    // =================================================

    if (
      status &&
      status.trim()
    ) {
      filter.orderStatus =
        status
          .trim()
          .toUpperCase();
    }


    // =================================================
    // PAYMENT METHOD FILTER
    // =================================================

    if (
      paymentMethod &&
      paymentMethod.trim()
    ) {
      filter.paymentMethod =
        paymentMethod
          .trim()
          .toUpperCase();
    }


    // =================================================
    // SEARCH
    // ORDER ID / CUSTOMER NAME / EMAIL / PHONE
    // =================================================

    if (
      search &&
      search.trim()
    ) {

      const searchValue =
        search.trim();


      const users =
        await User.find({
          $or: [
            {
              name: {
                $regex:
                  searchValue,
                $options:
                  "i",
              },
            },

            {
              email: {
                $regex:
                  searchValue,
                $options:
                  "i",
              },
            },

            {
              phone: {
                $regex:
                  searchValue,
                $options:
                  "i",
              },
            },
          ],
        }).select("_id");


      const userIds =
        users.map(
          (user) =>
            user._id
        );


      filter.$or = [
        {
          orderId: {
            $regex:
              searchValue,
            $options:
              "i",
          },
        },

        {
          user: {
            $in:
              userIds,
          },
        },
      ];
    }


    // =================================================
    // TOTAL ORDERS
    // =================================================

    const totalOrders =
      await Order.countDocuments(
        filter
      );


    // =================================================
    // FETCH ORDERS
    // =================================================

    const orders =
      await Order.find(filter)
        .populate(
          "user",
          "name email phone"
        )
        .populate(
          "items.product",
          "name price images sku"
        )
        .populate(
          "paymentId"
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limitNumber);


    // =================================================
    // PAGINATION
    // =================================================

    const totalPages =
      Math.ceil(
        totalOrders /
        limitNumber
      );


    // =================================================
    // RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      pagination: {
        currentPage:
          pageNumber,

        limit:
          limitNumber,

        totalOrders,

        totalPages,

        hasNextPage:
          pageNumber <
          totalPages,

        hasPreviousPage:
          pageNumber > 1,
      },

      orders,
    });

  } catch (error) {

    console.error(
      "Get Admin Orders Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to fetch orders",
    });
  }
};



// ========================================
// GET SINGLE ORDER FOR ADMIN
// SUPPORTS MONGO ID + ORDER ID
// ========================================

const getAdminOrderById =
  async (req, res) => {
    try {

      const { id } =
        req.params;


      let order = null;


      // =================================================
      // SEARCH BY MONGO _ID
      // =================================================

      if (
        mongoose.isValidObjectId(
          id
        )
      ) {
        order =
          await Order.findById(
            id
          );
      }


      // =================================================
      // SEARCH BY WEBSITE ORDER ID
      // =================================================

      if (!order) {
        order =
          await Order.findOne({
            orderId: id,
          });
      }


      // =================================================
      // NOT FOUND
      // =================================================

      if (!order) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found",
        });
      }


      // =================================================
      // POPULATE
      // =================================================

      order =
        await Order.findById(
          order._id
        )
          .populate(
            "user",
            "name email phone"
          )
          .populate(
            "items.product",
            "name price images sku"
          )
          .populate(
            "paymentId"
          );


      return res.status(200).json({
        success: true,
        order,
      });

    } catch (error) {

      console.error(
        "Get Admin Order Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to fetch order",
      });
    }
  };



// ========================================
// UPDATE ORDER STATUS - ADMIN
// ========================================

const updateAdminOrderStatus =
  async (req, res) => {
    try {

      const { id } =
        req.params;

      const { status } =
        req.body;


      // =================================================
      // ALLOWED STATUS
      // =================================================

      const allowedStatuses = [
        "PENDING",
        "CONFIRMED",
        "PROCESSING",
        "SHIPPED",
        "DELIVERED",
        "CANCELLED",
      ];


      // =================================================
      // VALIDATE STATUS
      // =================================================

      if (!status) {
        return res.status(400).json({
          success: false,
          message:
            "Order status is required",
        });
      }


      const newStatus =
        String(status)
          .trim()
          .toUpperCase();


      if (
        !allowedStatuses.includes(
          newStatus
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid order status",

          allowedStatuses,
        });
      }


      // =================================================
      // FIND ORDER
      // =================================================

      let order = null;


      if (
        mongoose.isValidObjectId(
          id
        )
      ) {
        order =
          await Order.findById(
            id
          );
      }


      if (!order) {
        order =
          await Order.findOne({
            orderId: id,
          });
      }


      if (!order) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found",
        });
      }


      // =================================================
      // CANCELLED ORDER CANNOT BE REOPENED
      // =================================================

      if (
        String(
          order.orderStatus
        ).toUpperCase() ===
        "CANCELLED" &&
        newStatus !==
        "CANCELLED"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Cancelled order cannot be reopened",
        });
      }


      // =================================================
      // DELIVERED ORDER
      // =================================================

      if (
        String(
          order.orderStatus
        ).toUpperCase() ===
        "DELIVERED" &&
        newStatus !==
        "DELIVERED" &&
        newStatus !==
        "CANCELLED"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Delivered order status cannot be changed",
        });
      }


      // =================================================
      // UPDATE
      // =================================================

      order.orderStatus =
        newStatus;


      await order.save();


      // =================================================
      // RESPONSE
      // =================================================

      return res.status(200).json({
        success: true,

        message:
          "Order status updated successfully",

        order,
      });

    } catch (error) {

      console.error(
        "Update Admin Order Status Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to update order status",
      });
    }
  };



// ========================================
// CANCEL ORDER - ADMIN
// ========================================

const cancelAdminOrder =
  async (req, res) => {
    try {

      const { id } =
        req.params;


      // =================================================
      // FIND ORDER
      // =================================================

      let order = null;


      if (
        mongoose.isValidObjectId(
          id
        )
      ) {
        order =
          await Order.findById(
            id
          );
      }


      if (!order) {
        order =
          await Order.findOne({
            orderId: id,
          });
      }


      // =================================================
      // NOT FOUND
      // =================================================

      if (!order) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found",
        });
      }


      // =================================================
      // ALREADY CANCELLED
      // =================================================

      if (
        String(
          order.orderStatus
        ).toUpperCase() ===
        "CANCELLED"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Order is already cancelled",
        });
      }


      // =================================================
      // DELIVERED ORDER
      // =================================================

      if (
        String(
          order.orderStatus
        ).toUpperCase() ===
        "DELIVERED"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Delivered order cannot be cancelled",
        });
      }


      // =================================================
      // CANCEL
      // =================================================

      order.orderStatus =
        "CANCELLED";


      await order.save();


      // =================================================
      // RESPONSE
      // =================================================

      return res.status(200).json({
        success: true,

        message:
          "Order cancelled successfully",

        order,
      });

    } catch (error) {

      console.error(
        "Cancel Admin Order Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to cancel order",
      });
    }
  };



// ========================================
// GET ALL CUSTOMERS
// ========================================

const getAllCustomers =
  async (req, res) => {
    try {

      const customers =
        await User.find({
          role: "user",
        }).select("_id name email phone role createdAt updatedAt")
          .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        count:
          customers.length,
        customers,
      });

    } catch (error) {

      console.error(
        "Get customers error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to get customers",
        error:
          error.message,
      });
    }
  };



// ========================================
// GET SALES ANALYTICS
// ========================================

const getSalesAnalytics = async (req, res) => {
  try {
    const sales = await Order.aggregate([
      {
        $group: {
          _id: null,

          // Total orders
          totalOrders: {
            $sum: 1,
          },

          // Gross sales = everything except cancelled
          grossSales: {
            $sum: {
              $cond: [
                {
                  $ne: ["$orderStatus", "CANCELLED"],
                },
                "$totalAmount",
                0,
              ],
            },
          },

          // Cancelled sales
          cancelledSales: {
            $sum: {
              $cond: [
                {
                  $eq: ["$orderStatus", "CANCELLED"],
                },
                "$totalAmount",
                0,
              ],
            },
          },

          // Realized sales
          // Delivered + PAID
          realizedSales: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $eq: ["$orderStatus", "DELIVERED"],
                    },
                    {
                      $eq: ["$paymentStatus", "PAID"],
                    },
                  ],
                },
                "$totalAmount",
                0,
              ],
            },
          },

          // Refunded sales
          refundedSales: {
            $sum: {
              $cond: [
                {
                  $eq: ["$paymentStatus", "REFUNDED"],
                },
                "$totalAmount",
                0,
              ],
            },
          },

          // Pending / active orders
          pendingSales: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $ne: ["$orderStatus", "CANCELLED"],
                    },
                    {
                      $ne: ["$orderStatus", "DELIVERED"],
                    },
                    {
                      $ne: ["$paymentStatus", "REFUNDED"],
                    },
                  ],
                },
                "$totalAmount",
                0,
              ],
            },
          },
        },
      },
    ]);

    const result = sales[0] || {
      totalOrders: 0,
      grossSales: 0,
      realizedSales: 0,
      pendingSales: 0,
      cancelledSales: 0,
      refundedSales: 0,
    };

    delete result._id;

    res.status(200).json({
      success: true,
      sales: result,
    });
  } catch (error) {
    console.error("Sales analytics error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get sales analytics",
      error: error.message,
    });
  }
};



// ========================================
// GET TOP PRODUCTS
// ========================================

const getTopProducts = async (req, res) => {
  try {
    const topProducts = await Order.aggregate([
      // Cancelled orders ko exclude karo
      {
        $match: {
          orderStatus: {
            $ne: "CANCELLED",
          },
        },
      },

      // Order ke items ko separate documents banao
      {
        $unwind: "$items",
      },

      // Product-wise quantity aur revenue calculate karo
      {
        $group: {
          _id: "$items.product",

          quantitySold: {
            $sum: "$items.quantity",
          },

          revenue: {
            $sum: {
              $multiply: [
                "$items.quantity",
                "$items.price",
              ],
            },
          },
        },
      },

      // Sabse zyada quantity sold pehle
      {
        $sort: {
          quantitySold: -1,
        },
      },

      // Top 10
      {
        $limit: 10,
      },

      // Product details fetch karo
      {
        $lookup: {
          from: "products",

          localField: "_id",

          foreignField: "_id",

          as: "product",
        },
      },

      {
        $unwind: "$product",
      },

      // Clean response
      {
        $project: {
          _id: 1,

          productName: "$product.name",

          quantitySold: 1,

          revenue: 1,

          images: "$product.images",

          sku: "$product.sku",
        },
      },
    ]);

    res.status(200).json({
      success: true,
      products: topProducts,
    });
  } catch (error) {
    console.error("Top products error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get top products",
      error: error.message,
    });
  }
};



// ========================================
// CREATE SUB-ADMIN
// ONLY MAIN ADMIN CAN CREATE
// ========================================

const createSubAdmin =
  async (req, res) => {
    try {

      if (
        req.user.role !==
        "admin"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Only admin can create subadmins",
        });
      }


      const {
        name,
        email,
        phone,
        password,
      } = req.body;


      if (
        !name ||
        !email ||
        !phone ||
        !password
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Name, email, phone and password are required",
        });
      }


      const existingEmail =
        await User.findOne({
          email:
            email.toLowerCase(),
        });


      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message:
            "Email already exists",
        });
      }


      const existingPhone =
        await User.findOne({
          phone,
        });


      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message:
            "Phone number already exists",
        });
      }


      const hashedPassword =
        await bcrypt.hash(
          password,
          10
        );


      const subAdmin =
        await User.create({
          name,
          email:
            email.toLowerCase(),
          phone,
          password:
            hashedPassword,
          role: "subadmin",
        });


      const subAdminResponse =
        subAdmin.toObject();


      delete subAdminResponse.password;
      delete subAdminResponse.resetPasswordToken;
      delete subAdminResponse.resetPasswordExpire;


      res.status(201).json({
        success: true,
        message:
          "Subadmin created successfully",
        subAdmin:
          subAdminResponse,
      });

    } catch (error) {

      console.error(
        "Create subadmin error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to create subadmin",
        error:
          error.message,
      });
    }
  };



// ========================================
// GET ALL SUB-ADMINS
// ========================================

const getAllSubAdmins =
  async (req, res) => {
    try {

      const subAdmins =
        await User.find({
          role: "subadmin",
        })
          .select("_id name email phone role createdAt updatedAt")
          .sort({ createdAt: -1 });


      res.status(200).json({
        success: true,

        count:
          subAdmins.length,

        subAdmins,
      });

    } catch (error) {

      console.error(
        "Get subadmins error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to get subadmins",
        error:
          error.message,
      });
    }
  };



// ========================================
// UPDATE SUB-ADMIN
// ========================================

const updateSubAdmin =
  async (req, res) => {
    try {

      if (
        req.user.role !==
        "admin"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Only admin can update subadmins",
        });
      }


      const { id } =
        req.params;


      const {
        name,
        email,
        phone,
        password,
      } = req.body;


      const subAdmin =
        await User.findOne({
          _id: id,
          role: "subadmin",
        });


      if (!subAdmin) {
        return res.status(404).json({
          success: false,
          message:
            "Subadmin not found",
        });
      }


      if (
        name !== undefined
      ) {
        subAdmin.name =
          name;
      }


      if (
        email !== undefined
      ) {

        const normalizedEmail =
          email.toLowerCase();


        const emailExists =
          await User.findOne({
            email:
              normalizedEmail,

            _id: {
              $ne: id,
            },
          });


        if (emailExists) {
          return res.status(400).json({
            success: false,
            message:
              "Email already exists",
          });
        }


        subAdmin.email =
          normalizedEmail;
      }


      if (
        phone !== undefined
      ) {

        const phoneExists =
          await User.findOne({
            phone,

            _id: {
              $ne: id,
            },
          });


        if (phoneExists) {
          return res.status(400).json({
            success: false,
            message:
              "Phone number already exists",
          });
        }


        subAdmin.phone =
          phone;
      }


      if (password) {
        subAdmin.password =
          await bcrypt.hash(
            password,
            10
          );
      }


      await subAdmin.save();


      const subAdminResponse =
        subAdmin.toObject();


      delete subAdminResponse.password;
      delete subAdminResponse.resetPasswordToken;
      delete subAdminResponse.resetPasswordExpire;


      res.status(200).json({
        success: true,
        message:
          "Subadmin updated successfully",
        subAdmin:
          subAdminResponse,
      });

    } catch (error) {

      console.error(
        "Update subadmin error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to update subadmin",
        error:
          error.message,
      });
    }
  };



// ========================================
// DELETE SUB-ADMIN
// ========================================

const deleteSubAdmin =
  async (req, res) => {
    try {

      if (
        req.user.role !==
        "admin"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Only admin can delete subadmins",
        });
      }


      const { id } =
        req.params;


      const subAdmin =
        await User.findOneAndDelete({
          _id: id,
          role: "subadmin",
        });


      if (!subAdmin) {
        return res.status(404).json({
          success: false,
          message:
            "Subadmin not found",
        });
      }


      res.status(200).json({
        success: true,
        message:
          "Subadmin deleted successfully",
      });

    } catch (error) {

      console.error(
        "Delete subadmin error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to delete subadmin",
        error:
          error.message,
      });
    }
  };

//========================================
// GET PAYMENT SUMMARY
//========================================
  const getPaymentSummary = async (req, res) => {
  try {
    const summary = await Order.aggregate([
      {
        $group: {
          _id: null,

          totalOrders: {
            $sum: 1,
          },

          totalAmount: {
            $sum: "$totalAmount",
          },

          // Payment status
          paidOrders: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "PAID"] },
                1,
                0,
              ],
            },
          },

          paidAmount: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "PAID"] },
                "$totalAmount",
                0,
              ],
            },
          },

          pendingOrders: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "PENDING"] },
                1,
                0,
              ],
            },
          },

          pendingAmount: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "PENDING"] },
                "$totalAmount",
                0,
              ],
            },
          },

          processingOrders: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "PROCESSING"] },
                1,
                0,
              ],
            },
          },

          processingAmount: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "PROCESSING"] },
                "$totalAmount",
                0,
              ],
            },
          },

          failedOrders: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "FAILED"] },
                1,
                0,
              ],
            },
          },

          failedAmount: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "FAILED"] },
                "$totalAmount",
                0,
              ],
            },
          },

          refundedOrders: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "REFUNDED"] },
                1,
                0,
              ],
            },
          },

          refundedAmount: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "REFUNDED"] },
                "$totalAmount",
                0,
              ],
            },
          },

          // Payment method
          codOrders: {
            $sum: {
              $cond: [
                { $eq: ["$paymentMethod", "COD"] },
                1,
                0,
              ],
            },
          },

          codAmount: {
            $sum: {
              $cond: [
                { $eq: ["$paymentMethod", "COD"] },
                "$totalAmount",
                0,
              ],
            },
          },

          onlineOrders: {
            $sum: {
              $cond: [
                { $eq: ["$paymentMethod", "ONLINE"] },
                1,
                0,
              ],
            },
          },

          onlineAmount: {
            $sum: {
              $cond: [
                { $eq: ["$paymentMethod", "ONLINE"] },
                "$totalAmount",
                0,
              ],
            },
          },
        },
      },
    ]);

    const result = summary[0] || {
      totalOrders: 0,
      totalAmount: 0,

      paidOrders: 0,
      paidAmount: 0,

      pendingOrders: 0,
      pendingAmount: 0,

      processingOrders: 0,
      processingAmount: 0,

      failedOrders: 0,
      failedAmount: 0,

      refundedOrders: 0,
      refundedAmount: 0,

      codOrders: 0,
      codAmount: 0,

      onlineOrders: 0,
      onlineAmount: 0,
    };

    delete result._id;

    res.status(200).json({
      success: true,
      summary: result,
    });
  } catch (error) {
    console.error("Payment summary error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get payment summary",
      error: error.message,
    });
  }
};
// ======================================== 
// GET SALES REPORT
// ========================================

const getSalesReport = async (req, res) => {
  try {
    const { range, startDate, endDate } = req.query;

    const now = new Date();

    let start;
    let end = new Date(now);

    // =========================
    // DATE RANGE
    // =========================

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);

      end.setHours(23, 59, 59, 999);
    } else {
      let days = 7;

      if (range === "15d") {
        days = 15;
      }

      if (range === "30d") {
        days = 30;
      }

      start = new Date(now);
      start.setDate(start.getDate() - (days - 1));
      start.setHours(0, 0, 0, 0);
    }

    // =========================
    // FETCH ORDERS
    // =========================

    const orders = await Order.find({
      createdAt: {
        $gte: start,
        $lte: end,
      },
    })
      .populate("items.product", "name images")
      .sort({ createdAt: 1 });

    // =========================
    // BASIC METRICS
    // =========================

    const totalOrders = orders.length;

    const validOrders = orders.filter(
      (order) =>
        String(order.orderStatus).toUpperCase() !==
        "CANCELLED"
    );

    const grossSales = validOrders.reduce(
      (sum, order) =>
        sum + Number(order.totalAmount || 0),
      0
    );

    const cancelledOrders = orders.filter(
      (order) =>
        String(order.orderStatus).toUpperCase() ===
        "CANCELLED"
    );

    const cancelledAmount = cancelledOrders.reduce(
      (sum, order) =>
        sum + Number(order.totalAmount || 0),
      0
    );

    const refundedAmount = orders
      .filter(
        (order) =>
          String(order.paymentStatus).toUpperCase() ===
          "REFUNDED"
      )
      .reduce(
        (sum, order) =>
          sum + Number(order.totalAmount || 0),
        0
      );

    // Net revenue
    const netRevenue =
      grossSales - refundedAmount;

    const averageOrderValue =
      validOrders.length > 0
        ? Math.round(
            grossSales / validOrders.length
          )
        : 0;

    // =========================
    // DAILY REVENUE TRAJECTORY
    // =========================

    const dailyMap = {};

    const cursor = new Date(start);

    while (cursor <= end) {
      const dateKey = cursor
        .toISOString()
        .split("T")[0];

      dailyMap[dateKey] = {
        date: dateKey,
        gross: 0,
        net: 0,
        orders: 0,
      };

      cursor.setDate(cursor.getDate() + 1);
    }

    validOrders.forEach((order) => {
      const dateKey = new Date(order.createdAt)
        .toISOString()
        .split("T")[0];

      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = {
          date: dateKey,
          gross: 0,
          net: 0,
          orders: 0,
        };
      }

      const amount = Number(
        order.totalAmount || 0
      );

      dailyMap[dateKey].gross += amount;

      if (
        String(order.paymentStatus).toUpperCase() !==
        "REFUNDED"
      ) {
        dailyMap[dateKey].net += amount;
      }

      dailyMap[dateKey].orders += 1;
    });

    const revenueTrajectory =
      Object.values(dailyMap).sort(
        (a, b) =>
          new Date(a.date) -
          new Date(b.date)
      );

    // =========================
    // TOP SELLING PRODUCTS
    // =========================

    const productMap = {};

    validOrders.forEach((order) => {
      order.items.forEach((item) => {
        const productId = item.product
          ? String(item.product._id || item.product)
          : "unknown";

        if (!productMap[productId]) {
          productMap[productId] = {
            productId,
            productName:
              item.product?.name ||
              item.name,

            quantitySold: 0,
            revenue: 0,
            images:
              item.product?.images || [],
          };
        }

        productMap[productId].quantitySold +=
          Number(item.quantity || 0);

        productMap[productId].revenue +=
          Number(item.total || 0);
      });
    });

    const topSellingItems = Object.values(
      productMap
    )
      .sort(
        (a, b) =>
          b.revenue - a.revenue
      )
      .slice(0, 10);

    // =========================
    // RESPONSE
    // =========================

    res.status(200).json({
      success: true,

      report: {
        timeframe: {
          startDate: start,
          endDate: end,
        },

        summary: {
          grossSales,
          netRevenue,
          totalOrders,
          averageOrderValue,

          cancelledOrders:
            cancelledOrders.length,

          cancelledAmount,

          refundedAmount,
        },

        revenueTrajectory,

        topSellingItems,

        discounts: {
          totalDiscount: 0,
          couponDiscount: 0,
        },
      },
    });
  } catch (error) {
    console.error(
      "Sales report error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to get sales report",
      error: error.message,
    });
  }
};



// ========================================
// EXPORTS
// ========================================

module.exports = {

  // Dashboard
  getAdminDashboard,

  // Orders
  getAllOrders,
  getAdminOrderById,
  updateAdminOrderStatus,
  cancelAdminOrder,

  // Customers
  getAllCustomers,

  // Analytics
  getSalesAnalytics,
  getTopProducts,

  // Sub Admin
  createSubAdmin,
  getAllSubAdmins,
  updateSubAdmin,
  deleteSubAdmin,

    getPaymentSummary,
    getSalesReport,
};