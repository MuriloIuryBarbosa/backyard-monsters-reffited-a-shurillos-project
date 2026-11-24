import { Status } from "../enums/StatusCodes.js";
import { GAME_LANGUAGES } from "../config/GameLanguages.js";
import type { KoaController } from "../utils/KoaController.js";

/**
 * Controller to handle the retrieval of supported languages.
 * 
 * To add a new language, update GAME_LANGUAGES
 * and provide a json file with the translations in 'public/gamestage/assets' directory.
 * 
 * @param {Context} ctx - The Koa context object.
 * @returns {Promise<void>} - A promise that resolves when the controller is complete.
 */
export const supportedLangs: KoaController = async (ctx) => {
  ctx.status = Status.OK;
  ctx.body = GAME_LANGUAGES;
};
