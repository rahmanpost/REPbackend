import Pricing from '../models/pricing.js';



// Admin updates a price
export const updatePrice = async (req, res) => {
  const { id } = req.params;
  const { price } = req.body;

  try {
    const updated = await Pricing.findByIdAndUpdate(id, { price }, { new: true });
    if (!updated) return res.status(404).json({ message: 'Price not found' });

    res.json({ message: 'Price updated', data: updated });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Admin deletes a price
export const deletePrice = async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await Pricing.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Price not found' });

    res.json({ message: 'Price deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Public: get price between two provinces
export const getPrice = async (req, res) => {
  const { from, to } = req.query;

  try {
    const price = await Pricing.findOne({ fromProvince: from, toProvince: to });
    if (!price) return res.status(404).json({ message: 'No pricing found for this route' });

    res.json({ data: price });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
