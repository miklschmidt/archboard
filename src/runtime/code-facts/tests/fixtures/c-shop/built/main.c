#include "api.h"
#include "q.h"
#include <vendor.h>
#include "shop/ledger.h"

int main(void) {
	return api_call() + quoted_call() + vendor_call();
}
