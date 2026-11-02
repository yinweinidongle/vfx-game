// Shared illustrated relics for the title cards, inventory and HUD.
export const itemIcon=(index,extra='')=>`<span class="item-art ${extra}" style="--ix:${index%4};--iy:${Math.floor(index/4)}" aria-hidden="true"></span>`;
