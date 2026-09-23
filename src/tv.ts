import { Platform } from "react-native";

/** Android TV / Google TV / Fire TV: на TV-устройствах приложение показывает
 *  собственный интерфейс (src/screens/tv/*) вместо телефонных экранов —
 *  портретная телефонная раскладка на пульте неиспользуема.
 *  Platform.isTV на Android = uiMode TYPE_TELEVISION (leanback). */
export const IS_TV: boolean = Platform.OS === "android" && Platform.isTV === true;
