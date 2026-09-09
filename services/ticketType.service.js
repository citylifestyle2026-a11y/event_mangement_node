const TicketType = require("../models/ticketType.model");

// Create Ticket Type
// `createdBy` is accepted as its own argument (set by the controller from
// req.user.id) rather than being expected inside `data` — mirrors
// eventService.createEvent(data, file, adminId).
const createTicketType = async (data, createdBy) => {
  return await TicketType.create({
    ...data,
    createdBy,
  });
};
// Get All Ticket Types
const getAllTicketTypes = async ({
  eventId,
  page = 1,
  limit = 10,
  search = "",
}) => {
  const query = {
    eventId,
    isDeleted: false,
  };

  if (search) {
    query.ticketName = {
      $regex: search,
      $options: "i",
    };
  }

  const skip = (page - 1) * limit;

  const total = await TicketType.countDocuments(query);

  const ticketTypes = await TicketType.find(query)
  .populate("createdBy", "name")
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(Number(limit));

  return {
    ticketTypes,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / limit),
  };
};
//update
const updateTicketType = async (id, data) => {
  // Whitelist: only these fields are ever writable via update. This
  // prevents a caller from smuggling in eventId, isDeleted, createdAt,
  // etc. through the same payload (previously `data` was passed straight
  // through to findOneAndUpdate with no filtering).
  const allowedFields = [
    "ticketName",
    "allowDayCount",
    "amount",
    "allowDates",
    "availableCount",
    "description",
  ];

  const updateData = {};

  allowedFields.forEach((field) => {
    if (data[field] !== undefined) {
      updateData[field] = data[field];
    }
  });

  // Populated here too, not just on getAllTicketTypes: the frontend patches
  // the edited row in place from this response (rather than refetching the
  // whole list), so without this the row's Created By would blank out to
  // "-" immediately after every edit until the next full page/list load.
  return await TicketType.findOneAndUpdate(
    {
      _id: id,
      isDeleted: false,
    },
    updateData,
    {
      new: true,
      runValidators: true,
    }
  ).populate("createdBy", "name");
};
// delete
const deleteTicketType = async (id) => {
  return await TicketType.findOneAndUpdate(
    {
      _id: id,
      isDeleted: false,
    },
    {
      isDeleted: true,
    },
    {
      new: true,
    }
  );
};
module.exports = {
  createTicketType,
  getAllTicketTypes,
  updateTicketType,
  deleteTicketType
};