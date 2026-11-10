-- Seventh Day: dados iniciais (salão, serviços, equipe, fotos)
-- Fotos com caminho /fotos/... ficam no próprio site (pasta fotos do repositório).
-- Para trocar o e-mail de administrador, edite a última linha de equipe antes de rodar.

insert into public.config (id,nome,nome_completo,whatsapp,whatsapp_txt,telefone,instagram,endereco,maps_query,horarios) values
(1,'Seventh Day','Seventh Day Barbearia e Cabeleireiros','5511983867901','(11) 98386-7901','(11) 2361-0045','7thdaycabeleireiros',
'R. Otusco, 416, Jardim Ipê, São Paulo/SP, 05797-430 (ao lado do Supermercado Lopes)','Seventh Day Barbearia e Cabeleireiros, R. Otusco, 416, São Paulo','{"0": ["10:00", "17:00"], "1": ["10:00", "20:00"], "2": ["10:00", "20:00"], "3": ["10:00", "19:00"], "4": ["10:00", "20:00"], "5": ["10:00", "17:00"], "6": null}'::jsonb);
insert into public.servicos (categoria,nome,duracao,preco,obs,ordem) values
('Cortes masculinos','Corte 3D (o mais pedido)',30,42,'R$ 40 no Pix ou dinheiro',0),('Cortes masculinos','Corte social máquina e tesoura',30,42,null,1),('Cortes masculinos','Corte social na tesoura',40,47,null,2),('Cortes masculinos','Corte navalhado',45,47,null,3),('Cortes masculinos','Corte baixo na máquina',25,32,null,4),('Cortes masculinos','Corte com visagismo',60,50,null,5),('Cortes masculinos','Freestyle (risquinhos no cabelo)',10,22,null,6),('Barba e acabamento','Corte e barba alinhada',75,85,null,7),('Barba e acabamento','Corte e barba com visagismo',90,105,null,8),('Barba e acabamento','Barba (raspar tudo)',20,27,null,9),('Barba e acabamento','Barba modelada (desenhada)',45,42,null,10),('Barba e acabamento','Barba e pezinho',50,62,null,11),('Barba e acabamento','Pezinho (design e acabamento)',15,27,null,12),('Barba e acabamento','Sobrancelha masculina na navalha',15,22,null,13),('Química masculina','Progressiva ou selagem masculina',120,75,null,14),('Química masculina','Coloração masculina',60,65,null,15),('Química masculina','Luzes masculino',150,75,null,16),('Química masculina','Cronograma masculino (hidratação, reconstrução, nutrição)',25,32,null,17),('Cortes femininos e escova','Corte feminino básico (sem lavar e sem secar)',30,42,null,18),('Cortes femininos e escova','Corte feminino com lavagem (sem secar)',45,55,null,19),('Cortes femininos e escova','Corte feminino tendência do momento',90,85,null,20),('Cortes femininos e escova','Escova simples',40,47,null,21),('Cortes femininos e escova','Escova modelada (babyliss, miracurl ou chapinha)',60,85,null,22),('Cortes femininos e escova','Sobrancelha feminina na navalha',20,27,null,23),('Tratamentos e química femininos','Cronograma feminino (hidratação, reconstrução, nutrição)',40,55,null,24),('Tratamentos e química femininos','Coloração feminina',90,105,null,25),('Tratamentos e química femininos','Progressiva feminina orgânica',180,155,null,26),('Tratamentos e química femininos','Selagem feminina',150,155,null,27),('Tratamentos e química femininos','Botox feminino',120,135,null,28);

insert into public.equipe (nome,descricao,foto_url,papel,atende,ordem,email) values
('Roque Jesus','Proprietário','/fotos/equipe-roque.jpg','dono',true,0,null),
('Lucas','Cabeleireiro e barbeiro','/fotos/equipe-lucas.jpg','profissional',true,1,null),
('Tito (administrador)','Acesso de administração do site',null,'dono',false,9,'victorlimads14@gmail.com');

insert into public.galeria (url,legenda,secao,ordem) values
('/fotos/p0_0.jpg','Fachada do salão','fachada',0),
('/fotos/p0_3.jpg','Corte masculino social com barba alinhada','trabalhos',0),
('/fotos/p0_5.jpg','Corte chanel feminino','trabalhos',1),
('/fotos/p0_7.jpg','Degradê com desenho em V','trabalhos',2),
('/fotos/p0_2.jpg','Corte feminino curto cacheado','trabalhos',3),
('/fotos/p1_1.jpg','Corte reto com escova','trabalhos',4),
('/fotos/p1_0.jpg','Degradê com barba grisalha','trabalhos',5),
('/fotos/p0_6.jpg','Cabelo longo liso','trabalhos',6),
('/fotos/p1_6.jpg','Degradê com luzes nas pontas','trabalhos',7),
('/fotos/p0_4.jpg','Chanel de lado','trabalhos',8),
('/fotos/p1_3.jpg','Corte em camadas com ombré','trabalhos',9),
('/fotos/p1_2.jpg','Barba desenhada e degradê','trabalhos',10),
('/fotos/p0_1.jpg','Corte cacheado com degradê','trabalhos',11),
('/fotos/p2_3.jpg','Camadas com ombré, vista lateral','trabalhos',12),
('/fotos/p2_4.jpg','Corte curto feminino com fios brancos','trabalhos',13);
