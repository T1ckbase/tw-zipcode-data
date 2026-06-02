export type Address = [
  /** 縣市 */
  city: string,
  /** 郵遞區號 */
  zipCode: string,
  /** 區域 */
  district: string,
  /** 路名 */
  road: string,
  /** 段號 */
  section: string,
  /** 投遞範圍 */
  scope: string,
  /** 大宗段名稱 */
  bulkRecipient: string,
];

declare const data: Address[];
export default data;
