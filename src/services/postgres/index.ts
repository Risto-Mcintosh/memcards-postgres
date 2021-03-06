import bcrypt from 'bcrypt';
import { DataService } from '../dataService.types';
import { Request, Response, NextFunction } from 'express';
import postgres from './databaseConnect';
import tokenGenerator from '../tokenGenerator';
import * as Schema from './schema';
import * as ObjFactory from './objFactory';
import * as QueryHelper from './queryHelper';
import { Transaction } from 'knex';
require('dotenv').config();

export default class PostgresService implements DataService {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await postgres<Schema.Users>('users')
        .innerJoin<Schema.Login>('login', 'users.email', 'login.email')
        .where('users.email', req.body.email)
        .first();
      if (!user) return res.status(400).send('email or password is incorrect');

      const validPassword = await bcrypt.compare(req.body.password, user.hash);

      if (!validPassword)
        return res.status(400).send('email or password is incorrect');

      const TWELVE_HOURS = 900000 * 4 * 12;

      return res
        .cookie('webToken', tokenGenerator(user.id), {
          httpOnly: true,
          maxAge: TWELVE_HOURS
        })
        .status(200)
        .send({
          userName: user.name,
          userId: user.id,
          token: tokenGenerator(user.id)
        });
    } catch (error) {
      next(error);
    }
  }

  logout(req: Request, res: Response) {
    res.clearCookie('webToken').send();
  }

  async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const emailExist = await postgres<Schema.Users>('users').where(
        'email',
        req.body.email
      );

      if (emailExist.length)
        return res.status(400).send('email is already in use');

      await postgres.transaction(async (trx: Transaction) => {
        await trx<Schema.Login>('login').insert({
          email: req.body.email,
          hash: await bcrypt.hash(req.body.password, 10)
        });

        const newUser = await trx<Schema.Users>('users')
          .insert({
            name: req.body.userName,
            email: req.body.email
          })
          .returning(['id', 'name']);

        return res.send({ userName: newUser[0].name, userId: newUser[0].id });
      });
    } catch (error) {
      next(error);
    }
  }
  async getAllDecks(req: Request, res: Response, next: NextFunction) {
    try {
      const decksIdColumnIdentifier = postgres.ref('decks.id');
      const flashcardCountQuery = postgres<Schema.Flashcards>('flashcards')
        .count('*')
        .where('deck_id', decksIdColumnIdentifier)
        .as('cardCount');
      const decks = await postgres<Schema.Decks>('decks')
        .select('name', 'id', flashcardCountQuery)
        .where('user_id', req.query.userId as string);

      console.dir({ decks }, { depth: 10 });
      res.send(decks).status(200);
    } catch (error) {
      next(error);
    }
  }
  async getDeck(req: Request, res: Response, next: NextFunction) {
    try {
      const deck = await postgres<Schema.Decks>('decks')
        .where('id', req.params.deckId)
        .first();
      const flashcards = await postgres<Schema.Flashcards>('flashcards')
        .select('*')
        .where('deck_id', req.params.deckId);
      res
        .send({
          deckName: deck?.name,
          cards: flashcards.map(ObjFactory.flashcardObjForClient)
        })
        .status(200);
    } catch (error) {
      next(error);
    }
  }
  async createDeck(req: Request, res: Response, next: NextFunction) {
    try {
      await postgres.transaction(async (trx: Transaction) => {
        const deckId = await trx<Schema.Decks>('decks')
          .insert({
            name: req.body.deckName,
            user_id: req.query.userId as string
          })
          .returning('id');

        await QueryHelper.addFlashcardToDB(deckId[0], req.body.card, trx);

        return res.send(deckId[0]).status(201);
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteDeck(req: Request, res: Response, next: NextFunction) {
    try {
      await postgres.transaction(async (trx: Transaction) => {
        await trx<Schema.Flashcards>('flashcards')
          .where('deck_id', req.params.deckId)
          .del();

        await trx<Schema.Decks>('decks').where('id', req.params.deckId).del();
      });
      res.send('deck deleted').status(200);
    } catch (error) {
      next(error);
    }
  }

  async createCard(req: Request, res: Response, next: NextFunction) {
    try {
      await QueryHelper.addFlashcardToDB(req.params.deckId, req.body, postgres);

      res.status(201).send('card created!');
    } catch (error) {
      next(error);
    }
  }
  async editCard(req: Request, res: Response, next: NextFunction) {
    try {
      const newCard = await postgres<Schema.Flashcards>('flashcards')
        .update(ObjFactory.flashcardObjForDB(req.body))
        .where({
          deck_id: req.params.deckId,
          id: req.params.cardId
        })
        .returning('*');
      console.log(newCard);
      if (!newCard) return res.send('server error').status(500);
      res.send(ObjFactory.flashcardObjForClient(newCard[0])).status(201);
    } catch (error) {
      next(error);
    }
  }
  async deleteCard(req: Request, res: Response, next: NextFunction) {
    try {
      await postgres<Schema.Flashcards>('flashcards').del().where({
        deck_id: req.params.deckId,
        id: req.params.cardId
      });
      res.send('card deleted').status(200);
    } catch (error) {
      next(error);
    }
  }
}
