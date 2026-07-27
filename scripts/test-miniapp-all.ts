// Keep the public contract checks behind one package/CI command. The
// react-server condition is supplied by package.json because the DTO module
// intentionally imports server-only image URL helpers.
import "./test-miniapp-contract";
import "./test-miniapp-booking-dto";
import "./test-miniapp-openapi";
