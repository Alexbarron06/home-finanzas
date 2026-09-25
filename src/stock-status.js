export function stockStatus(product) {
 const onHand = Number(product.on_hand);
 if (onHand === 0) return 'Terminado';
 if (onHand <= Number(product.minimum)) return 'Por terminar';
 return 'Disponible';
}
