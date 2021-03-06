import {Request, Response} from 'express';

import db from '../database/connection';
import convertHourToMinutes from '../utils/convertHourToMinutes';

interface ScheduleItem {
    week_day: number;
    from: string;
    to: string;
}

export default class ClassesController {
    async index(req: Request, res: Response) {
        const filters = req.query;

        const subject = filters.subject as string;
        const week_day = filters.week_day as string;
        const time = filters.time as string;

        if (!filters.subject || !filters.subject || !filters.time) {
            return res.status(400).json({
                error: 'Missing filters to search classes',
            });
        }

        const timeInMinutes = convertHourToMinutes(time);

        const classes = await db('classes')
            .whereExists(function() {
                this.select('class_schedule.*')
                    .from('class_schedule')
                    .whereRaw('`class_schedule`.`class_id` = `classes`.`id`')
                    .whereRaw('`class_schedule`.`week_day` = ??', [Number(week_day)])
                    .whereRaw('`class_schedule`.`from` <= ??', [timeInMinutes])
                    .whereRaw('`class_schedule`.`to` > ??', [timeInMinutes])
            })
            .where('classes.subject', '=', subject)
            .join('users', 'classes.user_id', '=', 'users.id')
            .select(['classes.*', 'users.*']);

        return res.send(classes);
    }

    async create(req: Request, res: Response) {
        const {
            name,
            avatar,
            whatsapp,
            bio,
            subject,
            cost,
            scheduled,
        } = req.body;
    
        const trx = await db.transaction();
    
        try {  

            // Cadastrando o professor que vai prestar a aula
            const insertedUserIds = await trx('users').insert({
                name,
                avatar,
                whatsapp,
                bio,
            });
        
            const user_id = insertedUserIds[0];
            
            // Registrando as aulas que o professor tem
            const insertedClassesIds = await trx('classes').insert({
                subject,
                cost,
                user_id,
            })
        
            const class_id = insertedClassesIds[0];
            
            // Registrando os horários que esse professor atua
            const classScheduled: ScheduleItem[] = scheduled.map((scheduleItem: ScheduleItem) => ({
                class_id,
                week_day: scheduleItem.week_day,
                from: convertHourToMinutes(scheduleItem.from),
                to: convertHourToMinutes(scheduleItem.to),
            }))
        
            await trx('class_schedule').insert(classScheduled);
        
            await trx.commit();
            
            return res.status(201).send();
        } catch(err) {
            await trx.rollback();
    
            return res.status(400).json({
                error: 'Unexpected error while creating new class',
            });
        }
    }
}