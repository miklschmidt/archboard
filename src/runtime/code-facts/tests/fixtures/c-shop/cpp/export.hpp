namespace shop {

class SHOP_EXPORT Register {
 public:
	void open();

 private:
	int count_;
};

SHOP_BEGIN_EXPORT
namespace detail {
int rank(int item);
}
SHOP_END_EXPORT

}  // namespace shop
