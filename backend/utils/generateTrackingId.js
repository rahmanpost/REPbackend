const generateTrackingId = () => {
  const date = new Date();

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  const datePart = `${yyyy}${mm}${dd}`;
  const randomPart = Math.floor(10000 + Math.random() * 90000); // 🔢 5-digit number

  return `RXP-${datePart}-${randomPart}`;
};

export default generateTrackingId;
