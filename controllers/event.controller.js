const eventService = require("../services/event.service");
//create event
exports.createEvent = async (req, res, next) => {
  try {
    // Creator always comes from the authenticated admin (via `protect`),
    // never from the request body.
    const event = await eventService.createEvent(req.body, req.file, req.user.id);

    return res.status(201).json({
      success: true,
      message: "Event created successfully.",
      data: event,
    });
  } catch (error) {
    next(error);
  }
};
// get by id
exports.getEventById = async (req, res, next) => {
  try {
    const event = await eventService.getEventById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Event fetched successfully",
      data: event,
    });
  } catch (error) {
    next(error);
  }
};
// Get All Events
exports.getAllEvents = async (req, res, next) => {
  try {
    const result = await eventService.getAllEvents(req.query);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
// Update Event
exports.updateEvent = async (req, res, next) => {
  try {
    const event = await eventService.updateEvent(
      req.params.id,
      req.body,
      req.file
    );

    return res.status(200).json({
      success: true,
      message: "Event updated successfully.",
      data: event,
    });
  } catch (error) {
    next(error);
  }
};
// Delete Event
exports.deleteEvent = async (req, res, next) => {
  try {
    const result = await eventService.deleteEvent(req.params.id, req.user.id);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
// Change Event Status
exports.changeEventStatus = async (req, res, next) => {
  try {
    const result = await eventService.changeEventStatus(req.params.id);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};